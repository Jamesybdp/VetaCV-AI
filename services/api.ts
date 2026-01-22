
import { UserProfile, SavedCV, JobApplication, Transaction } from "../types";
import { supabase } from "./supabaseClient";

/**
 * VetaCV AI™ Unified API Service
 * Strategy: "Supabase First, Local Fallback"
 * 
 * 1. Attempts to connect to Supabase.
 * 2. If configuration is missing (URL/Key) or connection fails, automatically degrades to LocalStorage.
 * 3. IMPORTANT: 'guest' users or local IDs always use LocalStorage to avoid DB constraint errors.
 */

export class ApiService {
  private useLocal = false;

  constructor() {
    this.checkHealth();
  }

  private async checkHealth() {
    // Basic check: If URL includes 'your-project-id', user hasn't set it up yet.
    const url = (supabase as any).supabaseUrl || '';
    if (url.includes('your-project-id') || !url) {
      console.warn("⚠️ Supabase not configured. Using LocalStorage Mode.");
      this.useLocal = true;
      return;
    }

    try {
      // Lightweight check to ping the DB
      const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
      
      if (error) {
         // PGRST = PostgREST error. 
         // If we get permission denied (401/403) or RLS error, Supabase IS reachable, so we stay Online.
         // Only fallback if it's a fetch/network error.
         if (error.message && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
             console.warn("⚠️ Supabase unreachable (Network Error). Switching to LocalStorage Mode.");
             this.useLocal = true;
         }
      }
    } catch (e) {
      console.warn("⚠️ Supabase check failed. Switching to LocalStorage Mode.");
      this.useLocal = true;
    }
  }

  // Helper to determine if we should skip DB for this user
  private shouldSkipDB(userId: string): boolean {
    return this.useLocal || userId === 'guest' || userId.startsWith('local_');
  }

  // --- USER AUTH & PROFILE ---

  /**
   * Triggers the Supabase OAuth flow (Redirects to Google)
   */
  async triggerGoogleSignIn() {
    if (this.useLocal) {
        throw new Error("Cannot use Google Auth in Local/Offline mode. Check Supabase config.");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin // Redirect back to this app
      }
    });
    if (error) throw error;
  }

  /**
   * Syncs a Supabase Auth Session User into our public 'users' table and returns the Profile.
   * Called by App.tsx after redirect.
   */
  async syncSession(authUser: any): Promise<UserProfile> {
    if (this.useLocal) return this.mockLogin(authUser.email || 'guest', 'Guest');

    const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User';
    const email = authUser.email || '';

    try {
        // Upsert user into our public 'users' table
        const { error: dbError } = await supabase
            .from('users')
            .upsert({
                id: authUser.id,
                email: email,
                name: name,
            }, { onConflict: 'id' })
            .select()
            .single();

        if (dbError) throw dbError;

        // Hydrate full profile
        return this.getUser(authUser.id) as Promise<UserProfile>;
    } catch (e) {
        console.error("Session Sync Error:", e);
        // Fallback
        return this.mockLogin(email, name);
    }
  }

  // Deprecated direct token login in favor of syncSession
  async loginGoogle(token: string, profile: { name: string; email: string }): Promise<UserProfile> {
      return this.mockLogin(profile.email, profile.name);
  }

  async getUser(userId: string): Promise<UserProfile | null> {
    if (this.shouldSkipDB(userId) || userId === 'current') return this.getLocalUser();
    
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !user) throw error;

      // Parallel fetch for related data
      const [cvs, txs, jobs] = await Promise.all([
        this.getSavedCVs(userId),
        this.getTransactions(userId),
        this.getJobApplications(userId)
      ]);

      return {
        id: user.id,
        isAnonymous: false,
        name: user.name,
        email: user.email,
        tokens: user.tokens || 0,
        plan: user.plan || 'Free',
        autoApplyCredits: { used: 0, total: user.tokens || 0 }, // Simplified mapping
        savedCVs: cvs,
        transactions: txs
      };
    } catch (e) {
      return this.getLocalUser();
    }
  }

  async updateUserTokens(userId: string, tokens: number, plan: string): Promise<void> {
    if (this.shouldSkipDB(userId)) {
        const user = this.getLocalUser();
        if (user) {
            user.tokens = tokens;
            user.plan = plan as any;
            this.saveLocalUser(user);
        }
        return;
    }
    await supabase.from('users').update({ tokens, plan }).eq('id', userId);
  }

  // --- CV ARCHIVE ---

  async saveCV(cv: SavedCV): Promise<void> {
    if (this.shouldSkipDB(cv.userId)) {
      const cvs = this.getLocalCVs();
      localStorage.setItem('veta_cvs', JSON.stringify([cv, ...cvs]));
      return;
    }
    
    // Map to DB columns
    await supabase.from('cv_archives').upsert({
      id: cv.id,
      user_id: cv.userId,
      target_role: cv.targetRole,
      preview_text: cv.previewText,
      data_json: cv.data,
      goals_json: cv.goals,
      created_at: cv.dateCreated
    });
  }

  async getSavedCVs(userId: string): Promise<SavedCV[]> {
    if (this.shouldSkipDB(userId)) return this.getLocalCVs();
    
    const { data, error } = await supabase
      .from('cv_archives')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) return this.getLocalCVs();

    return data.map(row => ({
      id: row.id,
      userId: row.user_id,
      dateCreated: row.created_at,
      targetRole: row.target_role,
      previewText: row.preview_text,
      data: row.data_json,
      goals: row.goals_json
    }));
  }

  async deleteCV(id: string): Promise<void> {
    // Note: We can't easily know if an ID is local or remote just by the ID string alone in this simple architecture
    // So we try both or rely on the fact that the current user context drives the UI.
    // For safety, we'll try to delete from local storage first.
    const localCVs = this.getLocalCVs();
    if (localCVs.some(c => c.id === id)) {
        const newCVs = localCVs.filter(c => c.id !== id);
        localStorage.setItem('veta_cvs', JSON.stringify(newCVs));
        // If we found it locally, we stop unless we want to sync deletes (advanced).
        return;
    }
    
    if (!this.useLocal) {
        await supabase.from('cv_archives').delete().eq('id', id);
    }
  }

  // --- JOB APPLICATIONS ---

  async saveJobApplication(job: JobApplication): Promise<void> {
    if (this.shouldSkipDB(job.userId || 'guest')) {
      const jobs = this.getLocalJobs();
      localStorage.setItem('veta_jobs', JSON.stringify([job, ...jobs]));
      return;
    }
    await supabase.from('job_applications').upsert({
      id: job.id,
      user_id: job.userId,
      company: job.company,
      role: job.role,
      status: job.status,
      notes: job.notes,
      date_applied: job.dateApplied
    });
  }

  async getJobApplications(userId: string): Promise<JobApplication[]> {
    if (this.shouldSkipDB(userId)) return this.getLocalJobs();
    
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('user_id', userId)
      .order('date_applied', { ascending: false });

    if (error || !data) return this.getLocalJobs();

    return data.map(row => ({
      id: row.id,
      userId: row.user_id,
      company: row.company,
      role: row.role,
      status: row.status,
      notes: row.notes,
      dateApplied: row.date_applied
    }));
  }

  async deleteJobApplication(id: string): Promise<void> {
    const localJobs = this.getLocalJobs();
    if (localJobs.some(j => j.id === id)) {
        const newJobs = localJobs.filter(j => j.id !== id);
        localStorage.setItem('veta_jobs', JSON.stringify(newJobs));
        return;
    }

    if (!this.useLocal) {
        await supabase.from('job_applications').delete().eq('id', id);
    }
  }

  // --- TRANSACTIONS ---

  async logTransaction(tx: Transaction, userId: string): Promise<void> {
    if (this.shouldSkipDB(userId)) {
      const txs = this.getLocalTransactions();
      localStorage.setItem('veta_transactions', JSON.stringify([tx, ...txs]));
      return;
    }
    await supabase.from('transactions').insert({
      id: tx.id,
      user_id: userId,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      date: tx.date
    });
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    if (this.shouldSkipDB(userId)) return this.getLocalTransactions();
    
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error || !data) return this.getLocalTransactions();

    return data.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type
    }));
  }

  // --- LOCAL STORAGE HELPERS ---

  private getLocalUser(): UserProfile | null {
    const saved = localStorage.getItem('veta_user');
    if (!saved) return null;
    const user = JSON.parse(saved);
    user.savedCVs = this.getLocalCVs();
    user.transactions = this.getLocalTransactions();
    return user;
  }

  private saveLocalUser(user: UserProfile) {
    const { savedCVs, transactions, ...rest } = user;
    localStorage.setItem('veta_user', JSON.stringify(rest));
  }

  private getLocalCVs(): SavedCV[] {
    return JSON.parse(localStorage.getItem('veta_cvs') || '[]');
  }

  private getLocalJobs(): JobApplication[] {
    return JSON.parse(localStorage.getItem('veta_jobs') || '[]');
  }

  private getLocalTransactions(): Transaction[] {
    return JSON.parse(localStorage.getItem('veta_transactions') || '[]');
  }

  private mockLogin(email: string, name: string): UserProfile {
    // Check if exists locally
    let user = this.getLocalUser();
    if (!user || user.email !== email) {
      user = {
        id: 'local_' + Date.now(),
        isAnonymous: false,
        name: name,
        email: email,
        tokens: 5,
        plan: 'Free',
        autoApplyCredits: { used: 0, total: 5 },
        savedCVs: [],
        transactions: []
      };
      this.saveLocalUser(user);
    }
    return user;
  }
}
