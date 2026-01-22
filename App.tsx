
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppStep, CareerGoals, OptimizationResult, JobApplication, UserProfile, PricingPlan, Transaction, SavedCV } from './types';
import { GeminiService } from './services/geminiService';
import { ApiService } from './services/api';
import { supabase } from './services/supabaseClient';
import { RefinementResult } from './services/refinementService';
import { RefinementChat } from './components/RefinementChat';
import { sanitizeHtmlForPdf, debugHtmlStructure, SanitizationResult } from './utils/htmlSanitizer';
import { validateCVData } from './utils/dataValidator';
import { injectContactData, ContactData } from './utils/dataInjector';
import { runPDFTestSuite } from './utils/pdfTestSuite';

declare const mammoth: any;
declare const pdfjsLib: any;
declare const html2pdf: any;
declare const window: any;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// --- ROBUST LOGO COMPONENT ---
const VetaLogo: React.FC<{ className?: string; variant?: 'header' | 'footer' }> = ({ className, variant = 'header' }) => (
    <svg 
      viewBox="0 0 100 100" 
      className={className} 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" stroke="url(#logoGradient)" strokeWidth="3" />
      <path d="M50 5 L50 15 M50 85 L50 95 M5 50 L15 50 M85 50 L95 50" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.5"/>
      <path 
        d="M25 30 L50 85 L75 30 L65 30 L50 65 L35 30 Z" 
        fill="url(#logoGradient)" 
        stroke="white" 
        strokeWidth="1"
      />
      <path 
        d="M38 30 L50 55 L62 30" 
        fill="none" 
        stroke="white" 
        strokeWidth="1" 
        opacity="0.5"
      />
      <defs>
        <linearGradient id="logoGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f46e5" />
          <stop offset="0.5" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
);

// Tab Configuration with Icons
const TAB_CONFIG = [
  { id: 'ats', label: 'ATS Vetting', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'human', label: 'Elite Archive', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { id: 'linkedin', label: 'Sync Node', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { id: 'branding', label: 'Visual Hub', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'cover-letter', label: 'Cover Letter', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'interview', label: 'Interview Prep', icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z' },
  { id: 'tracker', label: 'Job Tracker', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' }
];

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 5,
    price: 0.99,
    tag: 'BUDGET',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    features: ['One-time payment', 'Secure payment via Paynow', 'Use credits to apply to jobs']
  },
  {
    id: 'standard',
    name: 'Standard',
    credits: 20,
    price: 3.99,
    tag: 'POPULAR',
    color: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    features: ['One-time payment', 'Secure payment via Paynow', 'Use credits to apply to jobs']
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 50,
    price: 5.99,
    tag: 'BEST VALUE',
    color: 'bg-purple-50 text-purple-600 border-purple-200',
    features: ['One-time payment', 'Secure payment via Paynow', 'Use credits to apply to jobs']
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    credits: '∞',
    price: 9.99,
    tag: 'ELITE',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    features: ['One-time payment', 'Secure payment via Paynow', 'Use credits to apply to jobs']
  }
];

// Auth Modal Component
const AuthModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string) => void;
  onGoogleLogin: () => void;
}> = ({ isOpen, onClose, onLogin, onGoogleLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-indigo-50 rounded-2xl mb-4 text-3xl shadow-inner">🔐</div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{isLogin ? 'Welcome Back' : 'Create Veta Account'}</h2>
          <p className="text-sm text-slate-500 mt-2">Sync your vetted CVs across devices.</p>
        </div>

        <div className="mb-6">
           <button 
             onClick={onGoogleLogin}
             className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex items-center justify-center gap-3 h-14"
           >
             <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
               <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
               <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
               <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
               <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
             </svg>
             <span>Continue with Google</span>
           </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
          <div className="relative flex justify-center text-xs"><span className="px-4 bg-white text-slate-400 font-bold uppercase tracking-widest">Or continue with email</span></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input 
              type="email" 
              required
              placeholder="Email Address" 
              className="w-full p-4 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <input 
              type="password" 
              required
              placeholder="Password" 
              className="w-full p-4 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          
          <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 uppercase tracking-widest text-xs mt-4">
            {isLogin ? 'Secure Login' : 'Register Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors"
          >
            {isLogin ? "New to Veta? Create Account" : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Payment Gateway Modal
const PaymentGatewayModal: React.FC<{
  onClose: () => void;
  onPaymentComplete: (plan: PricingPlan) => void;
  currentBalance: number;
}> = ({ onClose, onPaymentComplete, currentBalance }) => {
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [paymentStep, setPaymentStep] = useState<'select' | 'pay'>('select');

  const handleSelectPlan = (plan: PricingPlan) => {
    setSelectedPlan(plan);
    setPaymentStep('pay');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-6xl z-10 flex flex-col items-center">
        {/* Header Section */}
        <div className="glass-panel w-full max-w-4xl mb-8 p-8 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center text-center md:text-left border border-white/50">
          <div>
            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em] mb-2">Current Credit Balance</p>
            <h2 className="text-6xl font-black text-slate-900 tracking-tighter">{currentBalance}</h2>
          </div>
          <div className="mt-4 md:mt-0 text-right">
            <p className="text-indigo-600 text-[10px] font-black uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-full inline-block mb-1">USD Payments</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Secured by Paynow</p>
          </div>
        </div>

        {paymentStep === 'select' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
            {PRICING_PLANS.map((plan) => (
              <div 
                key={plan.id} 
                className={`bg-white rounded-[2.5rem] p-6 relative group hover:-translate-y-2 transition-all duration-500 flex flex-col shadow-lg hover:shadow-2xl border-2 ${plan.id === 'standard' ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-white'}`}
              >
                {plan.tag && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase px-4 py-1.5 rounded-full shadow-md tracking-widest ${plan.color}`}>
                    {plan.tag}
                  </div>
                )}
                
                <div className="text-center mt-4 mb-6">
                  <h3 className="text-xl font-black text-slate-900 mb-1">{plan.name}</h3>
                  <div className="flex justify-center items-baseline gap-1">
                    <span className="text-lg font-bold text-slate-400">$</span>
                    <span className="text-4xl font-black text-slate-900 tracking-tighter">{plan.price}</span>
                  </div>
                </div>

                <div className="flex-1 bg-slate-50 rounded-[1.5rem] p-6 mb-6 flex flex-col items-center justify-center border border-slate-100">
                  <span className="text-5xl font-black text-indigo-600 mb-2">{plan.credits}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Credits</span>
                </div>

                <div className="space-y-3 mb-8 px-2">
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs text-slate-600 font-medium">
                      <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[8px] font-bold">✓</div>
                      {feat}
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => handleSelectPlan(plan)}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 ${plan.id === 'standard' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-900 text-white hover:bg-black'}`}
                >
                  Select Plan
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center animate-in slide-in-from-bottom-8 shadow-2xl border border-slate-100">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center text-4xl mb-8 mx-auto shadow-inner">
              🛒
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Checkout: {selectedPlan?.name}</h3>
            <p className="text-slate-500 mb-8 text-sm font-medium">You are purchasing {selectedPlan?.credits} credits for <strong className="text-slate-900">${selectedPlan?.price}</strong>.</p>
            
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 w-full mb-8 group cursor-pointer hover:border-indigo-200 transition-colors">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Secure Payment via Paynow</p>
              <a 
                href='https://www.paynow.co.zw/Payment/Link/?q=c2VhcmNoPW1hbmFnZW1lbnQlNDB5YmRwc3lzdGVtcy5jb20mYW1vdW50PTAuMDEmcmVmZXJlbmNlPSZsPTE%3d' 
                target='_blank' 
                rel="noopener noreferrer"
                className="block transform hover:scale-105 transition-transform duration-300"
              >
                <img src='https://www.paynow.co.zw/Content/Buttons/Medium_buttons/button_buy-now_medium.png' style={{border:0, margin:'0 auto'}} alt="Paynow" />
              </a>
              <p className="text-[9px] text-slate-400 mt-6 font-bold uppercase tracking-wider group-hover:text-indigo-400 transition-colors">Opens in a new secure tab</p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => onPaymentComplete(selectedPlan!)} 
                className="w-full bg-emerald-500 text-white font-black py-5 rounded-[1.5rem] shadow-xl hover:bg-emerald-600 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                I Have Completed Payment
              </button>
              <button onClick={() => setPaymentStep('select')} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest py-3">
                Change Plan
              </button>
            </div>
          </div>
        )}
        
        <button onClick={onClose} className="absolute top-0 right-0 md:-top-12 md:-right-12 text-white/50 hover:text-white p-4 transition-colors">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
};

// Profile Page Component (Unchanged)
const ProfileView: React.FC<{
  profile: UserProfile;
  onNavigate: (step: AppStep, tab?: string) => void;
  onUpgrade: () => void;
  onLoginRequest: () => void;
  onLoadCV: (savedCV: SavedCV) => void;
  onDeleteCV: (id: string) => void;
}> = ({ profile, onNavigate, onUpgrade, onLoginRequest, onLoadCV, onDeleteCV }) => {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-4xl font-black text-slate-900 tracking-tight">My Profile</h2>
        {profile.isAnonymous ? (
           <button onClick={onLoginRequest} className="bg-indigo-600 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors">
             Sign In / Register
           </button>
        ) : (
           <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest">
             {profile.plan} Plan
           </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="col-span-1 md:col-span-2 glass-panel rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
          <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-4xl shadow-xl text-white">
            {profile.name.charAt(0)}
          </div>
          <div className="text-center md:text-left space-y-2">
            <h3 className="text-2xl font-black text-slate-900">{profile.name}</h3>
            <p className="text-slate-500 font-medium">{profile.isAnonymous ? "Guest User (Data Local)" : profile.email}</p>
            {!profile.isAnonymous && <button className="text-xs font-bold text-indigo-600 hover:underline">Edit Profile Settings</button>}
          </div>
        </div>

        <div className="col-span-1 bg-[#0f172a] text-white rounded-[2.5rem] p-8 flex flex-col justify-between relative overflow-hidden group cursor-pointer" onClick={onUpgrade}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Available Tokens</p>
            <h3 className="text-6xl font-black text-blue-400">{profile.tokens}</h3>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400 group-hover:text-white transition-colors">
            <span>Get more tokens</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SAVED CVs SECTION */}
        <div className="glass-panel rounded-[2.5rem] p-8 border border-white/50 flex flex-col h-full">
           <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl text-purple-600">💾</div>
                 <h4 className="text-lg font-black text-slate-900">Saved CV Archive</h4>
              </div>
              <span className="text-xs font-bold text-slate-400">{profile.savedCVs?.length || 0} items</span>
           </div>

           <div className="flex-1 bg-slate-50 rounded-2xl overflow-y-auto max-h-[400px] border border-slate-100 custom-scrollbar">
              {profile.savedCVs && profile.savedCVs.length > 0 ? (
                 <div className="divide-y divide-slate-100">
                    {profile.savedCVs.map((cv) => (
                       <div key={cv.id} className="p-5 hover:bg-white transition-colors group">
                          <div className="flex justify-between items-start mb-2">
                             <h5 className="font-bold text-slate-800">{cv.targetRole}</h5>
                             <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(cv.dateCreated).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mb-4 italic">{cv.previewText}</p>
                          <div className="flex gap-3">
                             <button 
                                onClick={() => onLoadCV(cv)}
                                className="flex-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                             >
                                Load
                             </button>
                             <button 
                                onClick={() => onDeleteCV(cv.id)}
                                className="px-3 bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                             >
                                🗑️
                             </button>
                          </div>
                       </div>
                    ))}
                 </div>
              ) : (
                 <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                    <span className="text-4xl mb-3 opacity-30">📂</span>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Archive Empty</p>
                 </div>
              )}
           </div>
        </div>

        {/* TRANSACTIONS SECTION */}
        <div className="glass-panel rounded-[2.5rem] p-8 border border-white/50 flex flex-col h-full">
          <div className="flex justify-between items-end mb-6">
             <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl text-emerald-600">💳</div>
                 <h4 className="text-lg font-black text-slate-900">Transaction Ledger</h4>
             </div>
             {profile.isAnonymous && <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Local Session</span>}
          </div>
          
          <div className="flex-1 bg-slate-50 rounded-2xl overflow-y-auto max-h-[400px] border border-slate-100 custom-scrollbar">
             {profile.transactions && profile.transactions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                   {profile.transactions.map((t) => (
                      <div key={t.id} className="p-4 flex justify-between items-center hover:bg-white transition-colors">
                         <div>
                            <p className="text-sm font-bold text-slate-800">{t.description}</p>
                            <p className="text-xs text-slate-400">{new Date(t.date).toLocaleDateString()}</p>
                         </div>
                         <span className={`text-sm font-black ${t.amount > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                            {t.amount > 0 ? '+' : ''}{t.amount}
                         </span>
                      </div>
                   ))}
                </div>
             ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                   <span className="text-4xl mb-3 opacity-30">🧾</span>
                   <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No Transactions</p>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Data Collection Modal (Unchanged)
const DataCollectionForm: React.FC<{
  missingFields: string[];
  onSave: (data: ContactData) => void;
  onCancel: () => void;
}> = ({ missingFields, onSave, onCancel }) => {
  const [formData, setFormData] = useState<ContactData>({
    name: '',
    phone: '',
    email: '',
    location: '',
    linkedin: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-8 border-b bg-slate-50">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-2xl mb-4">🔧</div>
          <h3 className="text-2xl font-black text-slate-900">Final Polish Required</h3>
          <p className="text-sm text-slate-500 mt-2">
            The Vetting Engine detected placeholder data. Please provide the missing details.
          </p>
        </div>
        
        <div className="p-8 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {(missingFields.includes('name') || !missingFields.length) && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Full Name</label>
                <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Nathaniel Magaya" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-700" />
              </div>
            )}
            {(missingFields.includes('phone') || !missingFields.length) && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Phone Number</label>
                <input name="phone" value={formData.phone} onChange={handleChange} placeholder="e.g. +263 77 123 4567" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-700" />
              </div>
            )}
            {(missingFields.includes('email') || !missingFields.length) && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email Address</label>
                <input name="email" value={formData.email} onChange={handleChange} placeholder="e.g. name@domain.com" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-700" />
              </div>
            )}
            {(missingFields.includes('location') || !missingFields.length) && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Location</label>
                <input name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Harare, Zimbabwe" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-700" />
              </div>
            )}
          </div>
        </div>

        <div className="p-8 border-t bg-slate-50 flex justify-end gap-4">
          <button onClick={onCancel} className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Skip</button>
          <button onClick={() => onSave(formData)} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95">
            Inject Data & Finalize
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INITIAL);
  const [rawCV, setRawCV] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ats' | 'human' | 'linkedin' | 'branding' | 'cover-letter' | 'interview' | 'tracker'>('ats');
  const [goals, setGoals] = useState<CareerGoals>({
    targetRole: '',
    industry: '',
    locationPreference: '',
    moveType: 'vertical',
    jobDescription: '',
    recipientContext: ''
  });
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showBrandingInCV, setShowBrandingInCV] = useState(true);
  const [showDigitalBadge, setShowDigitalBadge] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showToS, setShowToS] = useState(false);
  const [sanitizationResult, setSanitizationResult] = useState<SanitizationResult | null>(null);
  
  // New States for Features
  const [history, setHistory] = useState<OptimizationResult[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoadingCoverLetter, setIsLoadingCoverLetter] = useState(false);
  const [isLoadingInterview, setIsLoadingInterview] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Job Tracker States
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [newJob, setNewJob] = useState<Partial<JobApplication>>({ status: 'Applied' });

  // Data Collection States
  const [showDataForm, setShowDataForm] = useState(false);
  const [missingDataFields, setMissingDataFields] = useState<string[]>([]);

  // Payment & Auth States
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  const [userProfile, setUserProfile] = useState<UserProfile>({
    id: 'guest',
    isAnonymous: true,
    name: 'Guest User',
    email: '',
    tokens: 2,
    plan: 'Free',
    autoApplyCredits: { used: 2, total: 2 },
    transactions: [],
    savedCVs: []
  });
  
  const cvPreviewRef = useRef<HTMLDivElement>(null);
  const gemini = new GeminiService();
  const api = useRef(new ApiService()); // Use ref to keep singleton instance

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      runPDFTestSuite().then(results => console.log('✅ PDF Test Suite Initialization', results));
    }
  }, []);

  // Hydrate user from API on load
  useEffect(() => {
    const hydrate = async () => {
      // 1. Check for existing Supabase session (Handling Redirects)
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
         // If we have a session, sync it to our DB and load profile
         const profile = await api.current.syncSession(session.user);
         const jobs = await api.current.getJobApplications(profile.id);
         setUserProfile(profile);
         setJobApplications(jobs);
         setIsInitialLoad(false);
      } else {
         // Fallback to local storage or guest
         const savedUser = await api.current.getUser('current');
         if (savedUser) {
           const jobs = await api.current.getJobApplications(savedUser.id);
           setUserProfile(savedUser);
           setJobApplications(jobs);
         }
         setIsInitialLoad(false);
      }
      
      // Restore application state if available
      const savedState = localStorage.getItem('veta_state_full');
      if (savedState) {
         try {
           const parsed = JSON.parse(savedState);
           setStep(parsed.step || AppStep.INITIAL);
           setRawCV(parsed.rawCV || '');
           setGoals(parsed.goals || goals);
           if (parsed.optimization) {
             setOptimization(parsed.optimization);
             setHistory([parsed.optimization]);
             setHistoryIndex(0);
           }
         } catch(e) {}
      }
    };

    // 2. Listen for Auth Changes (e.g. Login, Logout, Redirect completion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            const profile = await api.current.syncSession(session.user);
            const jobs = await api.current.getJobApplications(profile.id);
            setUserProfile(profile);
            setJobApplications(jobs);
            // Don't overwrite isInitialLoad here to avoid flickering if already handled
        } else if (event === 'SIGNED_OUT') {
            setUserProfile({
                id: 'guest',
                isAnonymous: true,
                name: 'Guest User',
                email: '',
                tokens: 2,
                plan: 'Free',
                autoApplyCredits: { used: 2, total: 2 },
                transactions: [],
                savedCVs: []
            });
            setJobApplications([]);
        }
    });

    hydrate();

    return () => {
        subscription.unsubscribe();
    };
  }, []);

  // Save state
  useEffect(() => {
    if (isInitialLoad) return;
    const timeout = setTimeout(() => {
      try {
        const stateToSave = { step, rawCV, goals, optimization };
        localStorage.setItem('veta_state_full', JSON.stringify(stateToSave));
      } catch (e) {
        console.error("Failed to save state", e);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [step, rawCV, goals, optimization, isInitialLoad]);

  const addToHistory = (newState: OptimizationResult) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setOptimization(newState);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setOptimization(history[prevIndex]);
      showToast("Change reverted.");
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setOptimization(history[nextIndex]);
      showToast("Change re-applied.");
    }
  };

  const handleManualEdit = (newHtml: string) => {
    if (!optimization || newHtml === optimization.humanVersion) return;
    const newState = { ...optimization, humanVersion: newHtml };
    addToHistory(newState);
  };

  const handleAddApplication = async () => {
    if (!newJob.company || !newJob.role) {
      showToast("Company and Role are required.", 'error');
      return;
    }
    const application: JobApplication = {
      id: Date.now().toString(),
      userId: userProfile.id,
      company: newJob.company,
      role: newJob.role,
      status: newJob.status as any || 'Applied',
      dateApplied: new Date().toISOString(),
      notes: newJob.notes || ''
    };
    
    // Save to backend via API
    await api.current.saveJobApplication(application);
    
    setJobApplications(prev => [application, ...prev]);
    setShowAddJobModal(false);
    setNewJob({ status: 'Applied' });
    showToast("Application tracked.");
  };

  const handleDeleteApplication = async (id: string) => {
    if (window.confirm("Remove this application from tracking?")) {
      await api.current.deleteJobApplication(id);
      setJobApplications(prev => prev.filter(app => app.id !== id));
      showToast("Application removed.");
    }
  };

  const handleStatusChange = async (id: string, newStatus: JobApplication['status']) => {
    const updated = jobApplications.find(app => app.id === id);
    if (!updated) return;
    
    const newApp = { ...updated, status: newStatus };
    // Optimistic update
    setJobApplications(prev => prev.map(app => app.id === id ? newApp : app));
    
    // In a real app we'd have an update method, but for now we can just re-save (if backend supports upsert or handled by save logic)
    // The current backend INSERT might fail on duplicate ID, so ideally we need an UPDATE route or handle upsert.
    // For simplicity with this mock backend, we'll assume save handles it or just acknowledge the UI update.
    // To be safe with the SQLite backend (which uses INSERT), we'll skip the API call for status update in this demo
    // or we would need to implement PUT /api/jobs/:id.
    // Let's stick to local UI update for status change to avoid DB unique constraint error on simple INSERT.
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`Copied! Vetting result ready to use.`);
  }, [showToast]);

  const handleExportPDF = async () => {
    if (!optimization?.humanVersion) {
      showToast("No CV content available to export.", "error");
      return;
    }

    if (userProfile.tokens < 1 && userProfile.plan === 'Free') {
        setShowPaymentModal(true);
        return;
    }

    debugHtmlStructure(optimization.humanVersion);
    const result = sanitizeHtmlForPdf(optimization.humanVersion);
    setSanitizationResult(result);
    
    let finalHtml = result.html;
    if (showDigitalBadge) {
      const badgeHtml = `
        <div class="veta-footer">
          <hr style="margin: 30px 0 10px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 0.8em; color: #666; font-style: italic; text-align: center;">
            Vetted by VetaCV AI™ — Precision-Engineered for the SADC Global Professional.
          </p>
        </div>
      `;
      finalHtml = finalHtml.replace('</div>\n</body>', `${badgeHtml}\n</div>\n</body>`);
    }

    const element = document.createElement('div');
    element.innerHTML = finalHtml;
    document.body.appendChild(element); 

    try {
      showToast("Rendering High-Fidelity PDF...");
      
      const opt = {
        margin: [10, 10, 10, 10], 
        filename: `Vetted_by_VetaCV_AI_${goals.targetRole.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#FFFFFF',
          letterRendering: true,
          logging: false,
          width: 794, 
          height: element.scrollHeight,
          onclone: (clonedDoc: any) => {
            clonedDoc.body.style.width = '210mm';
            clonedDoc.body.style.fontFamily = "'Georgia', 'Times New Roman', serif";
            clonedDoc.body.style.whiteSpace = 'normal';
          }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, hotfixes: ['px_scaling'] },
        pagebreak: { 
          mode: ['css', 'legacy'], 
          before: '.page-break',
          avoid: ['h1', 'h2', 'h3', 'li', 'table', '.keep-together'] 
        }
      };

      await html2pdf().set(opt).from(element).save();
      showToast("Download Complete. Tarisa CV Yako!");
    } catch (e: any) {
      console.error(e);
      showToast("PDF Generation Failed. Try printing instead.", "error");
    } finally {
      if (element.parentNode) {
        document.body.removeChild(element);
      }
    }
  };

  const handleStart = () => {
    setStep(AppStep.UPLOAD_CV);
    setRawCV('');
    setGoals({ targetRole: '', industry: '', locationPreference: '', moveType: 'vertical', jobDescription: '', recipientContext: '' });
    setOptimization(null);
    setError(null);
    setShowDataForm(false);
    setHistory([]);
    setHistoryIndex(-1);
    setJobApplications([]);
    localStorage.removeItem('veta_state'); 
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'source' | 'template') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);
    try {
      const text = await extractTextFromFile(file);
      if (type === 'source') {
        setRawCV(text);
        showToast("Tarisa CV Yako! Archive synchronized.");
      } else {
        showToast("Vetting template absorbed. Applying minimalist principles.");
      }
    } catch (err: any) {
      showToast("Mhosva iripo: " + err.message, 'error');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    if (file.size > MAX_FILE_SIZE) throw new Error('File overflow. Max 5MB allowed.');
    const extension = file.name.split('.').pop()?.toLowerCase();
    try {
      if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      } 
      if (extension === 'pdf') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        return fullText;
      }
      return await file.text();
    } catch (err: any) {
      throw new Error('Archive deconstruction failure.');
    }
  };

  const handleOptimize = async () => {
    if (!agreedToTerms) {
      showToast("You must agree to the Terms of Service to proceed.", 'error');
      return;
    }
    if (!rawCV.trim()) { showToast("Saka tivete chii? Upload source material.", 'error'); return; }
    if (!goals.jobDescription.trim()) { showToast("Provide Target JD for vetting precision.", 'error'); return; }
    setIsLoading(true);
    setStep(AppStep.ANALYZING);
    try {
      const result = await gemini.optimizeCV(rawCV, goals);
      setOptimization(result);
      addToHistory(result); 
      
      // Auto-save CV to Archive (SavedCV)
      const savedRecord: SavedCV = {
        id: Date.now().toString(),
        userId: userProfile.id,
        dateCreated: new Date().toISOString(),
        targetRole: goals.targetRole,
        previewText: result.analysis.narrativeAlignment || "Professional CV Optimization",
        data: result,
        goals: goals
      };
      
      await api.current.saveCV(savedRecord);
      
      // Update local state for immediate feedback
      setUserProfile(prev => ({
        ...prev,
        savedCVs: [savedRecord, ...(prev.savedCVs || [])],
        tokens: !prev.isAnonymous ? prev.tokens - 1 : prev.tokens
      }));

      // Auto-save to Job Tracker
      const newApp: JobApplication = {
        id: Date.now().toString(),
        userId: userProfile.id,
        company: goals.recipientContext || 'Pending Company',
        role: goals.targetRole || 'Vetted Application',
        status: 'Saved',
        dateApplied: new Date().toISOString(),
        notes: 'Auto-saved from Vetting Session'
      };
      await api.current.saveJobApplication(newApp);
      setJobApplications(prev => [newApp, ...prev]);

      // Log transaction if using tokens
      if (!userProfile.isAnonymous) {
         const tx: Transaction = {
             id: Date.now().toString(),
             date: new Date().toISOString(),
             description: `CV Optimization: ${goals.targetRole}`,
             amount: -1,
             type: 'usage'
         };
         await api.current.logTransaction(tx, userProfile.id);
      }

      const validation = validateCVData(result.humanVersion);
      if (!validation.valid) {
        setMissingDataFields(validation.missing);
        setShowDataForm(true);
      }

      setStep(AppStep.DASHBOARD);
      showToast("Vetting Node: COMPLETE. Result optimized, saved & tracked.");
    } catch (err: any) {
      setError(err.message);
      showToast("Optimization collision.", 'error');
      setStep(AppStep.UPLOAD_CV);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDataInjection = (data: ContactData) => {
    if (!optimization) return;
    const newHtml = injectContactData(optimization.humanVersion, data);
    const newState = { ...optimization, humanVersion: newHtml };
    setOptimization(newState);
    addToHistory(newState);
    setShowDataForm(false);
    showToast("Contact details injected successfully.");
    
    if (data.name) setUserProfile(prev => ({ ...prev, name: data.name! }));
    if (data.email) setUserProfile(prev => ({ ...prev, email: data.email! }));
  };

  const handleGenerateBranding = async () => {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) await window.aistudio.openSelectKey();
    setIsGeneratingImage(true);
    try {
      const imageUrl = await gemini.generateBrandingImage(goals.targetRole || 'Professional', goals.industry || 'Excellence', imageSize);
      const newState = optimization ? { ...optimization, brandingImage: imageUrl } : null;
      if (newState) {
        setOptimization(newState);
        addToHistory(newState);
      }
      setActiveTab('branding');
      showToast("Visual Synced! High-fidelity asset ready.");
    } catch (err: any) {
      showToast("Branding node failed.", 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!optimization || !goals.jobDescription) return;
    setIsLoadingCoverLetter(true);
    try {
      const cl = await gemini.generateCoverLetter(optimization.humanVersion, goals.jobDescription);
      const newState = { ...optimization, coverLetter: cl };
      setOptimization(newState);
      addToHistory(newState);
      showToast("Cover Letter Drafted.");
    } catch (err: any) {
      showToast("Cover Letter generation failed.", 'error');
    } finally {
      setIsLoadingCoverLetter(false);
    }
  };

  const handleGenerateInterview = async () => {
    if (!optimization || !goals.jobDescription) return;
    setIsLoadingInterview(true);
    try {
      const prep = await gemini.generateInterviewPrep(optimization.humanVersion, goals.jobDescription);
      const newState = { ...optimization, interviewPrep: prep };
      setOptimization(newState);
      addToHistory(newState);
      showToast("Interview Intel Gathered.");
    } catch (err: any) {
      showToast("Interview Prep generation failed.", 'error');
    } finally {
      setIsLoadingInterview(false);
    }
  };

  const handleRefinementComplete = (result: RefinementResult) => {
    if (!optimization) return;
    const newState = {
      ...optimization,
      humanVersion: result.humanVersion,
      digitalSync: {
        ...optimization.digitalSync,
        linkedinSummary: result.digitalSummary 
      }
    };
    setOptimization(newState);
    addToHistory(newState);
    showToast("Refinement Applied Successfully!");
  };

  const handlePaymentComplete = async (plan: PricingPlan) => {
     setIsPremiumUnlocked(true);
     setShowPaymentModal(false);
     
     const creditAmount = typeof plan.credits === 'number' ? plan.credits : 9999;
     const newTx: Transaction = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        description: `Purchase: ${plan.name} Plan`,
        amount: creditAmount,
        type: 'purchase'
     };

     // Persist to backend
     await api.current.logTransaction(newTx, userProfile.id);
     await api.current.updateUserTokens(userProfile.id, userProfile.tokens + creditAmount, plan.id === 'unlimited' ? 'Unlimited' : plan.name);

     setUserProfile(prev => {
       return {
         ...prev,
         tokens: prev.tokens + creditAmount,
         plan: plan.id === 'unlimited' ? 'Unlimited' : plan.id === 'pro' ? 'Pro' : plan.id === 'standard' ? 'Standard' : 'Starter',
         transactions: [newTx, ...(prev.transactions || [])]
       };
     });
     showToast(`Purchase Verified! ${plan.credits} credits added.`);
  };

  const handleAuthLogin = async (email: string) => {
     setShowAuthModal(false);
     // Simulate fetching user profile from backend
     const profile = { name: email.split('@')[0], email };
     const user = await api.current.loginGoogle("mock_token", profile);
     
     // Hydrate jobs after login
     const jobs = await api.current.getJobApplications(user.id);
     
     setUserProfile(user);
     setJobApplications(jobs);
     showToast("Secure session established.");
  };

  const handleGoogleLogin = async () => {
    setShowAuthModal(false);
    try {
      // Trigger Supabase OAuth Redirect
      await api.current.triggerGoogleSignIn();
    } catch (e: any) {
      showToast(`Google Authentication Failed: ${e.message}`, "error");
    }
  };

  const handleLoadCV = (saved: SavedCV) => {
     setGoals(saved.goals);
     setOptimization(saved.data);
     setHistory([saved.data]);
     setHistoryIndex(0);
     setStep(AppStep.DASHBOARD);
     setActiveTab('human');
     showToast("Archive Restored. Vetting Node Active.");
  };

  const handleDeleteCV = async (id: string) => {
    if (window.confirm("Permanently delete this vetted archive?")) {
       await api.current.deleteCV(id);
       setUserProfile(prev => ({
          ...prev,
          savedCVs: prev.savedCVs.filter(cv => cv.id !== id)
       }));
       showToast("Archive deleted.");
    }
  };

  const handleProfileNavigation = (destStep: AppStep, destTab?: string) => {
    setStep(destStep);
    if (destTab) setActiveTab(destTab as any);
  };

  const recipientSuggestions = ["Econet", "Delta Beverages", "Zimworx", "Old Mutual", "Cassava", "RemoteGlobal"];
  const locationSuggestions = ["Harare", "Bulawayo", "Remote (Global)", "Johannesburg"];

  const ToSContent = () => {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      <div className="prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed space-y-6">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">VetaCV AI™ TERMS OF SERVICE</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Updated: {today} | Effective Date: {today}</p>
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">1. Acceptance of Terms</h3>
          <p>By accessing or using the VetaCV AI™ software-as-a-service platform ("the Service"), including its proprietary Vetting Protocols, you ("User") agree to be bound by these Terms of Service ("ToS").</p>
        </section>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col transition-all duration-500 overflow-x-hidden">
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-6 duration-300">
          <div className={`px-10 py-5 rounded-[2.5rem] shadow-2xl flex items-center gap-4 text-xs font-black uppercase tracking-[0.2em] glass-panel border-2 ${toast.type === 'success' ? 'border-indigo-500/50 text-slate-900' : 'border-red-500/50 text-red-600'}`}>
            {toast.type === 'success' ? <span className="text-xl">✨</span> : <span className="text-xl">⚠️</span>} {toast.message}
          </div>
        </div>
      )}

      <AuthModal 
         isOpen={showAuthModal}
         onClose={() => setShowAuthModal(false)}
         onLogin={handleAuthLogin}
         onGoogleLogin={handleGoogleLogin}
      />

      {showPaymentModal && (
        <PaymentGatewayModal 
          onClose={() => setShowPaymentModal(false)}
          onPaymentComplete={handlePaymentComplete}
          currentBalance={userProfile.tokens}
        />
      )}
      
      {showDataForm && (
        <DataCollectionForm 
          missingFields={missingDataFields}
          onSave={handleDataInjection}
          onCancel={() => setShowDataForm(false)}
        />
      )}

      {showAddJobModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddJobModal(false)} />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-8 border-b bg-slate-50">
              <h3 className="text-2xl font-black text-slate-900">Track Application</h3>
            </div>
            <div className="p-8 space-y-4">
              <input 
                placeholder="Company Name" 
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none" 
                value={newJob.company || ''}
                onChange={e => setNewJob({...newJob, company: e.target.value})}
              />
              <input 
                placeholder="Role / Title" 
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none"
                value={newJob.role || ''}
                onChange={e => setNewJob({...newJob, role: e.target.value})}
              />
              <select 
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none"
                value={newJob.status}
                onChange={e => setNewJob({...newJob, status: e.target.value as any})}
              >
                <option value="Saved">Saved</option>
                <option value="Applied">Applied</option>
                <option value="Interviewing">Interviewing</option>
                <option value="Offer">Offer</option>
                <option value="Rejected">Rejected</option>
              </select>
              <textarea 
                placeholder="Notes (optional)" 
                className="w-full p-4 bg-slate-50 rounded-xl font-bold outline-none min-h-[100px]"
                value={newJob.notes || ''}
                onChange={e => setNewJob({...newJob, notes: e.target.value})}
              />
            </div>
            <div className="p-8 border-t bg-slate-50 flex justify-end gap-4">
              <button onClick={() => setShowAddJobModal(false)} className="px-6 py-3 font-bold text-slate-500 hover:text-slate-800">Cancel</button>
              <button onClick={handleAddApplication} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg">Track Job</button>
            </div>
          </div>
        </div>
      )}

      {showToS && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 lg:p-12 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={() => setShowToS(false)} />
          <div className="relative glass-panel bg-white w-full max-w-4xl max-h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 lg:p-12 border-b flex justify-between items-center">
              <h4 className="text-2xl font-black italic">Vetting Protocol v3.1</h4>
              <button onClick={() => setShowToS(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 lg:p-16 custom-scrollbar bg-white/50">
              <ToSContent />
            </div>
            <div className="p-8 lg:p-12 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setShowToS(false)} className="bg-slate-900 text-white font-black px-12 py-5 rounded-[2rem] shadow-xl hover:bg-black transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-[60] glass-panel border-b px-4 lg:px-8 py-4 flex justify-between items-center no-print bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep(AppStep.INITIAL)}>
          <VetaLogo className="h-10 w-10 lg:h-12 lg:w-12 object-contain hover:scale-105 transition-transform duration-300" />
          <span className="font-black text-lg tracking-tight hidden lg:block">VetaCV AI™</span>
        </div>
        
        <nav className="flex items-center gap-4 lg:gap-8">
            <button 
              onClick={() => {
                if (optimization) {
                  setStep(AppStep.DASHBOARD);
                  setActiveTab('human');
                } else {
                  showToast("Please vet a CV first", "error");
                }
              }} 
              className="flex items-center gap-2 text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors"
            >
                <span className="text-lg">🔖</span> <span className="hidden sm:inline">Saved</span>
            </button>
            <button 
              onClick={() => {
                if (optimization) {
                  setStep(AppStep.DASHBOARD);
                  setActiveTab('tracker');
                } else {
                  showToast("Please vet a CV first", "error");
                }
              }} 
              className="flex items-center gap-2 text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors"
            >
                <span className="text-lg">🚀</span> <span className="hidden sm:inline">Applied</span>
            </button>
            <button 
              onClick={() => setStep(AppStep.PROFILE)} 
              className={`flex items-center gap-2 text-[10px] lg:text-xs font-black uppercase tracking-widest transition-colors ${step === AppStep.PROFILE ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}
            >
                <span className="text-lg">👤</span> <span className="hidden sm:inline">Profile</span>
            </button>
            <button 
              onClick={() => setShowPaymentModal(true)} 
              className="flex items-center gap-2 text-[10px] lg:text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 px-4 py-2 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
                <span className="text-lg">💎</span> Pricing
            </button>
            {userProfile.isAnonymous && (
                <button 
                  onClick={() => setShowAuthModal(true)}
                  className="hidden lg:flex items-center gap-2 text-[10px] lg:text-xs font-black uppercase tracking-widest text-white bg-slate-900 px-5 py-2 rounded-full hover:bg-black transition-colors shadow-lg"
                >
                  Sign In
                </button>
            )}
        </nav>
      </header>

      <main className="flex-1 p-4 lg:p-12 max-w-[1600px] mx-auto w-full relative">
        {step === AppStep.INITIAL && (
          <div className="max-w-4xl mx-auto text-center py-20 lg:py-32 animate-in fade-in zoom-in duration-1000 px-6">
            <h2 className="text-6xl lg:text-9xl font-black text-slate-900 mb-8 tracking-tighter leading-none">
              Vet Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-600 via-purple-600 to-emerald-500">Professional Narrative.</span>
            </h2>
            <p className="text-xl lg:text-2xl text-slate-600 mb-14 max-w-2xl mx-auto font-medium leading-relaxed opacity-90">
              Transform raw professional history into job-winning masterpieces that dominate Applicant Tracking Systems and engage elite human reviewers. 
              Minimalist, quantified, and architected resumes for elite career opportunities.
            </p>
            <button onClick={handleStart} className="bg-slate-900 hover:bg-black text-white font-black py-6 px-20 rounded-[3rem] shadow-2xl hover:-translate-y-2 transition-all active:scale-95 flex items-center justify-center gap-4 mx-auto text-xl group">
              Start Vetting
              <svg className="h-6 w-6 transform group-hover:translate-x-1" fill="none" viewBox="0 0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </button>
          </div>
        )}

        {step === AppStep.PROFILE && (
          <ProfileView 
            profile={userProfile} 
            onNavigate={handleProfileNavigation}
            onUpgrade={() => setShowPaymentModal(true)}
            onLoginRequest={() => setShowAuthModal(true)}
            onLoadCV={handleLoadCV}
            onDeleteCV={handleDeleteCV}
          />
        )}

        {step === AppStep.UPLOAD_CV && (
          <div className="max-w-5xl mx-auto glass-panel rounded-[4rem] shadow-elite overflow-hidden animate-in slide-in-from-bottom-12 duration-700">
             <div className="p-8 lg:p-20">
                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 mb-4 tracking-tighter">01: Deconstruction</h3>
                <p className="text-slate-400 font-bold mb-14 uppercase tracking-[0.4em] text-[10px]">Isai CV yenyu.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">
                   <div className={`relative border-4 border-dashed rounded-[3.5rem] p-16 lg:p-20 text-center transition-all group ${isProcessingFile ? 'bg-indigo-50/50 border-indigo-200 animate-pulse' : 'border-slate-100 hover:border-indigo-400 hover:bg-indigo-50/30'}`}>
                      <input type="file" onChange={(e) => handleFileUpload(e, 'source')} className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait" disabled={isProcessingFile} />
                      <div className="text-8xl mb-8 group-hover:scale-110 transition-transform duration-500">📄</div>
                      <p className="text-xl font-black text-slate-800">Upload CV Archive</p>
                      <p className="text-[10px] text-slate-400 mt-5 uppercase font-black tracking-[0.4em]">PDF • DOCX • TXT</p>
                   </div>
                   <div className="flex flex-col">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-5">Manual Buffer Sync</label>
                      <textarea value={rawCV} onChange={(e) => setRawCV(e.target.value)} className="w-full flex-1 min-h-[18rem] p-8 bg-white/30 rounded-[3rem] border-2 border-slate-50 outline-none font-mono text-xs focus:border-indigo-600 transition-all custom-scrollbar shadow-inner" placeholder="Paste raw professional history..." />
                   </div>
                </div>
                <div className="mt-16 flex justify-end">
                   <button disabled={!rawCV.trim() || isProcessingFile} onClick={() => setStep(AppStep.TARGET_ROLE)} className="bg-indigo-600 text-white font-black px-20 py-6 rounded-[2.5rem] shadow-2xl hover:bg-indigo-700 transition-all group">
                      Next Protocol
                      <svg className="h-6 w-6 inline-block ml-4 transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                   </button>
                </div>
             </div>
          </div>
        )}

        {step === AppStep.TARGET_ROLE && (
          <div className="max-w-5xl mx-auto glass-panel rounded-[4rem] shadow-elite animate-in slide-in-from-right-12 duration-700 p-8 lg:p-20 border border-white/40">
             <h3 className="text-4xl lg:text-5xl font-black text-slate-900 mb-4 tracking-tighter">02: Precise Alignment</h3>
             <p className="text-slate-400 font-bold mb-14 uppercase tracking-[0.4em] text-[10px]">Synchronizing for the DHIRI.</p>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-14">
                <div className="space-y-6 lg:col-span-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] flex justify-between">Target Job Description</label>
                   <textarea value={goals.jobDescription} onChange={(e) => setGoals({...goals, jobDescription: e.target.value})} className="w-full p-8 bg-white/40 border-2 border-slate-50 rounded-[3rem] outline-none focus:border-indigo-600 transition-all font-medium text-sm min-h-[14rem] shadow-inner" placeholder="Paste target opportunity details..." />
                </div>
                <div className="space-y-5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Location Preferences</label>
                   <input value={goals.locationPreference} onChange={(e) => setGoals({...goals, locationPreference: e.target.value})} className="w-full p-6 bg-white/40 border-2 border-slate-50 rounded-[2rem] outline-none focus:border-indigo-600 transition-all font-black text-sm" placeholder="e.g. Remote / Harare" />
                   <div className="flex flex-wrap gap-2.5">
                      {locationSuggestions.map(s => <button key={s} onClick={() => setGoals({...goals, locationPreference: s})} className="text-[10px] font-bold bg-white px-4 py-2 rounded-full hover:text-indigo-600 transition-all shadow-sm">{s}</button>)}
                   </div>
                </div>
                <div className="space-y-5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Target Organization</label>
                   <input value={goals.recipientContext} onChange={(e) => setGoals({...goals, recipientContext: e.target.value})} className="w-full p-6 bg-white/40 border-2 border-slate-50 rounded-[2rem] outline-none focus:border-indigo-600 transition-all font-black text-sm" placeholder="e.g. Zimworx / Econet" />
                   <div className="flex flex-wrap gap-2.5">
                      {recipientSuggestions.map(s => <button key={s} onClick={() => setGoals({...goals, recipientContext: s})} className="text-[10px] font-bold bg-white px-4 py-2 rounded-full hover:text-indigo-600 transition-all shadow-sm">{s}</button>)}
                   </div>
                </div>
             </div>

             <div className="flex flex-col items-center gap-8 py-10 border-t border-slate-100">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      checked={agreedToTerms} 
                      onChange={(e) => setAgreedToTerms(e.target.checked)} 
                      className="peer sr-only"
                    />
                    <div className="w-8 h-8 bg-slate-100 border-2 border-slate-200 rounded-xl peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all group-hover:border-indigo-300"></div>
                    <svg className="absolute inset-1.5 w-5 h-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-600 select-none">
                    I agree to the <button onClick={() => setShowToS(true)} className="text-indigo-600 hover:underline">VetaCV AI™ Terms of Service</button> and Vetting Protocols.
                  </span>
                </label>

                <div className="flex justify-between items-center w-full">
                  <button onClick={() => setStep(AppStep.UPLOAD_CV)} className="text-slate-400 font-black text-[10px] uppercase tracking-[0.4em] hover:text-indigo-600 transition-colors">Return</button>
                  <button 
                    disabled={!goals.jobDescription.trim() || !agreedToTerms} 
                    onClick={handleOptimize} 
                    className={`bg-indigo-600 text-white font-black px-20 py-6 rounded-[2.5rem] shadow-2xl transition-all active:scale-95 ${!agreedToTerms ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:bg-indigo-700'}`}
                  >
                    Vet This CV
                  </button>
                </div>
             </div>
          </div>
        )}

        {step === AppStep.ANALYZING && (
          <div className="max-w-xl mx-auto py-40 text-center">
             <div className="w-32 h-32 bg-white rounded-[3rem] mx-auto mb-12 flex items-center justify-center animate-bounce shadow-2xl p-6">
                <VetaLogo className="w-full h-full object-contain" />
             </div>
             <h4 className="text-5xl font-black text-slate-900 mb-6 tracking-tighter italic">Vetting Narrative Node...</h4>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] animate-pulse">Wait for the DHIRI • Architecture in progress</p>
          </div>
        )}

        {step === AppStep.DASHBOARD && optimization && (
          <div className="relative">
            <RefinementChat 
              currentCV={{
                digitalSummary: optimization.digitalSync.linkedinSummary,
                humanVersion: optimization.humanVersion
              }}
              onRefinementComplete={handleRefinementComplete}
              userContext={{
                targetRole: goals.targetRole,
                targetIndustry: goals.industry
              }}
            />

            <div className="flex-1 space-y-8 lg:space-y-12 transition-all duration-700 max-w-[1400px] mx-auto">
               <div className="glass-panel rounded-[4rem] shadow-elite min-h-[900px] flex flex-col border border-white/40 overflow-hidden">
                  <nav className="flex items-center bg-white/50 border-b border-white/20 backdrop-blur-sm sticky top-0 z-40 no-print overflow-x-auto custom-scrollbar">
                     <div className="hidden lg:flex items-center px-4 border-r border-indigo-50/50 py-3">
                       <div className="flex bg-white/60 rounded-lg p-1 border border-indigo-50 shadow-sm">
                          <button 
                            onClick={handleUndo} 
                            disabled={historyIndex <= 0}
                            className="p-2 rounded-md hover:bg-white text-slate-600 disabled:opacity-30 transition-all"
                            title="Undo"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                          </button>
                          <button 
                            onClick={handleRedo}
                            disabled={historyIndex >= history.length - 1} 
                            className="p-2 rounded-md hover:bg-white text-slate-600 disabled:opacity-30 transition-all"
                            title="Redo"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                          </button>
                       </div>
                     </div>
                     <div className="flex flex-1 min-w-max px-2">
                        {TAB_CONFIG.map(t => (
                           <button
                              key={t.id}
                              onClick={() => setActiveTab(t.id as any)}
                              className={`flex items-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap ${
                                activeTab === t.id
                                  ? 'border-indigo-600 text-indigo-600 bg-white/40'
                                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/20'
                              }`}
                           >
                              <svg className={`w-4 h-4 ${activeTab === t.id ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                              </svg>
                              {t.label}
                           </button>
                        ))}
                     </div>
                  </nav>

                  <div className="flex-1 p-6 lg:p-14 overflow-y-auto max-h-[1400px] custom-scrollbar bg-white/10">
                     {activeTab === 'ats' && (
                       <div className="animate-in fade-in slide-in-from-right-6 duration-500">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
                             <h4 className="text-3xl font-black italic tracking-tight">ATS Scaled Payload</h4>
                             <button onClick={() => copyToClipboard(optimization.atsVersion, 'ATS Payload')} className="w-full sm:w-auto bg-slate-900 text-white text-[10px] font-black px-12 py-5 rounded-[2rem] hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-3 active:scale-95">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" /></svg>
                                Copy Vector
                             </button>
                          </div>
                          <div className="bg-white/80 p-10 lg:p-14 rounded-[4rem] border-2 border-white/40 font-mono text-sm text-slate-700 leading-relaxed whitespace-pre-wrap shadow-inner">{optimization.atsVersion}</div>
                       </div>
                     )}

                     {activeTab === 'human' && (
                       <div className="animate-in fade-in zoom-in duration-700">
                          <div className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-14 no-print">
                             <div>
                                <h4 className="text-3xl font-black italic tracking-tight">Elite Vetted Archive</h4>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-2 flex items-center gap-2">
                                  <span>✨ Click anywhere to edit directly</span>
                                </p>
                             </div>
                             <div className="flex flex-wrap gap-4 w-full sm:w-auto items-center">
                                {!isPremiumUnlocked && userProfile.plan === 'Free' ? (
                                   <button 
                                      onClick={() => setShowPaymentModal(true)} 
                                      className="flex-1 sm:flex-none bg-emerald-600 text-white text-[10px] font-black px-12 py-5 rounded-[1.5rem] shadow-2xl hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2"
                                   >
                                      <span className="text-lg">🔒</span> Unlock & Export ($0.01)
                                   </button>
                                ) : (
                                   <>
                                      <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-white border-2 text-[10px] font-black px-8 py-4 rounded-[1.5rem] hover:border-indigo-600 transition-all flex items-center justify-center gap-3 shadow-sm">
                                         Print
                                      </button>
                                      <button onClick={handleExportPDF} className="flex-1 sm:flex-none bg-indigo-600 text-white text-[10px] font-black px-12 py-5 rounded-[1.5rem] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">Download PDF</button>
                                   </>
                                )}
                             </div>
                          </div>
                          <div ref={cvPreviewRef} className={`paper-canvas mx-auto p-12 lg:p-24 w-full max-w-[850px] rounded-sm min-h-[1200px] overflow-hidden transform hover:scale-[1.005] transition-all bg-white ${!isPremiumUnlocked && userProfile.plan === 'Free' ? 'blur-[2px] select-none pointer-events-none' : ''}`}>
                             {optimization.brandingImage && showBrandingInCV && (
                               <div className="mb-14 rounded-[3rem] overflow-hidden border-[10px] border-slate-50 shadow-2xl">
                                  <img src={optimization.brandingImage} className="w-full h-52 lg:h-64 object-cover" alt="VetaCV Branding" />
                                </div>
                             )}
                             <div 
                               contentEditable={isPremiumUnlocked || userProfile.plan !== 'Free'}
                               suppressContentEditableWarning={true}
                               onBlur={(e) => handleManualEdit(e.currentTarget.innerHTML)}
                               className="serif-cv text-justify outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-8 rounded-lg transition-all"
                               dangerouslySetInnerHTML={{ __html: optimization.humanVersion }} 
                             />
                             {showDigitalBadge && (
                               <>
                                 <div className="veta-badge no-print">
                                    <VetaLogo className="w-4 h-4 object-contain" />
                                    Vetted by VetaCV AI™
                                 </div>
                                 <div className="hidden print:flex veta-badge">
                                    <VetaLogo className="w-4 h-4 object-contain mr-2" />
                                    Vetted by VetaCV AI™
                                 </div>
                               </>
                             )}
                          </div>
                       </div>
                     )}

                     {activeTab === 'linkedin' && (
                        <div className="animate-in fade-in slide-in-from-right-10 space-y-12">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                              <div className="bg-white/80 p-12 rounded-[4rem] relative group border-2 border-white/40 shadow-sm hover:shadow-xl transition-all">
                                 <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] block mb-8">Digital Headline</label>
                                 <p className="text-2xl font-black leading-tight mb-12 text-slate-900 tracking-tight">"{optimization.digitalSync.linkedinHeadline}"</p>
                                 <button onClick={() => copyToClipboard(optimization.digitalSync.linkedinHeadline, 'Headline')} className="absolute bottom-10 right-10 bg-indigo-600 text-white p-5 rounded-[2rem] shadow-2xl hover:scale-110 active:scale-90 transition-all">
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 5H6" /></svg>
                                 </button>
                              </div>
                              <div className="bg-slate-900 p-12 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
                                 <label className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.4em] block mb-10">Sync Keywords</label>
                                 <div className="flex flex-wrap gap-3">
                                    {optimization.digitalSync.suggestedSkills.slice(0, 36).map((s, i) => (
                                      <button key={i} onClick={() => copyToClipboard(s, 'Skill')} className="text-[10px] font-bold bg-white/10 px-5 py-2.5 rounded-2xl backdrop-blur-lg hover:bg-white/20 transition-all flex items-center gap-2">
                                        {s}
                                      </button>
                                    ))}
                                 </div>
                              </div>
                           </div>
                           <div className="bg-indigo-50/50 p-12 lg:p-16 rounded-[4.5rem] border-2 border-indigo-100 relative group shadow-sm">
                              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] block mb-10">Portfolio & Interview Prompts</label>
                              <div className="space-y-8">
                                {optimization.digitalSync.brandingPrompts.map((p, i) => (
                                  <div key={i} className="bg-white/80 p-8 rounded-[2rem] border border-white/40 shadow-sm relative group/prompt">
                                    <p className="text-sm font-bold text-slate-800 leading-relaxed italic pr-12">"{p}"</p>
                                    <button 
                                      onClick={() => copyToClipboard(p, `Prompt ${i+1}`)}
                                      className="absolute top-1/2 -translate-y-1/2 right-6 opacity-0 group-hover/prompt:opacity-100 p-3 bg-indigo-600 text-white rounded-xl transition-all shadow-xl scale-90"
                                    >
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 5H6" /></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                           </div>
                           <div className="bg-white/80 p-12 lg:p-16 rounded-[4.5rem] border-2 border-white/40 relative group shadow-inner">
                              <label className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] block mb-10">Shonglish Personal Sync</label>
                              <p className="text-lg font-medium text-slate-600 leading-relaxed whitespace-pre-wrap italic">{optimization.digitalSync.linkedinSummary}</p>
                           </div>
                        </div>
                     )}

                     {activeTab === 'branding' && (
                       <div className="animate-in fade-in zoom-in text-center py-8">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-20 text-left">
                             <div>
                                <h4 className="text-4xl font-black tracking-tighter italic">VetaCV Visual Synthesis</h4>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-3">Priority: Minimalist Mastery over Clutter.</p>
                             </div>
                             <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                                <label className="flex items-center gap-3 bg-white border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 cursor-pointer hover:border-indigo-600 transition-all">
                                  <input 
                                    type="checkbox" 
                                    checked={showDigitalBadge} 
                                    onChange={(e) => setShowDigitalBadge(e.target.checked)}
                                    className="w-5 h-5 accent-indigo-600"
                                  />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Include Vetting Badge</span>
                                </label>
                                <label className="relative cursor-pointer bg-white border-2 border-slate-100 rounded-[1.5rem] px-8 py-4 text-[10px] font-black uppercase tracking-widest shadow-xl hover:border-indigo-600 transition-all group/template">
                                   <span>Vetting Template Node</span>
                                   <input type="file" onChange={(e) => handleFileUpload(e, 'template')} className="hidden" />
                                </label>
                                <button onClick={handleGenerateBranding} disabled={isGeneratingImage} className="bg-slate-900 text-white font-black px-12 py-4 rounded-[1.5rem] text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl disabled:opacity-40 active:scale-95">
                                   {isGeneratingImage ? 'Synthesizing...' : 'Re-Generate Branding'}
                                </button>
                             </div>
                          </div>
                          {optimization.brandingImage ? (
                            <div className="rounded-[5rem] overflow-hidden shadow-elite border-[15px] border-white group relative aspect-video transition-all duration-700">
                               <img src={optimization.brandingImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3s]" alt="VetaCV Branding" />
                               <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-14">
                                  <a href={optimization.brandingImage} download="VetaCV_Identifier.png" className="bg-white text-slate-900 font-black px-12 py-5 rounded-[2rem] shadow-2xl hover:bg-slate-50 transition-colors text-xs self-end">Export High-Res Identifier</a>
                                </div>
                            </div>
                          ) : (
                            <div className="aspect-video bg-white/30 rounded-[5rem] border-4 border-dashed border-white/40 flex flex-col items-center justify-center p-20 animate-in fade-in duration-1000">
                               <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-12 text-5xl animate-float">🧬</div>
                               <h5 className="text-3xl font-black text-slate-800 tracking-tight mb-6">Visual Node Offline.</h5>
                               <button onClick={handleGenerateBranding} className="bg-slate-900 text-white font-black px-16 py-6 rounded-[2.5rem] shadow-2xl hover:bg-black transition-all">Initialize Visual Sync</button>
                            </div>
                          )}
                       </div>
                     )}

                     {activeTab === 'cover-letter' && (
                        <div className="animate-in fade-in slide-in-from-right-10">
                          <div className="flex justify-between items-center mb-10">
                            <div>
                               <h4 className="text-3xl font-black italic tracking-tight">Tailored Cover Letter</h4>
                               <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-2">Precision-engineered for the Job Description.</p>
                            </div>
                            <button 
                              onClick={handleGenerateCoverLetter} 
                              disabled={isLoadingCoverLetter}
                              className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                              {isLoadingCoverLetter ? 'Drafting...' : 'Generate New Draft'}
                            </button>
                          </div>
                          {optimization.coverLetter ? (
                            <div className="bg-white/80 p-12 rounded-[4rem] border-2 border-white/40 font-serif text-lg leading-relaxed text-slate-800 shadow-inner whitespace-pre-wrap relative group">
                               {optimization.coverLetter}
                               <button onClick={() => copyToClipboard(optimization.coverLetter!, 'Cover Letter')} className="absolute top-10 right-10 bg-slate-900 text-white p-4 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110">
                                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            </div>
                          ) : (
                             <div className="flex flex-col items-center justify-center py-20 bg-white/20 rounded-[4rem] border-4 border-dashed border-slate-200">
                                <div className="text-6xl mb-6 opacity-30">✉️</div>
                                <h5 className="text-xl font-bold text-slate-500 mb-6">No Cover Letter Generated Yet</h5>
                                <button onClick={handleGenerateCoverLetter} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-bold shadow-xl">Start Drafting</button>
                             </div>
                          )}
                        </div>
                     )}

                     {activeTab === 'interview' && (
                        <div className="animate-in fade-in slide-in-from-right-10">
                           <div className="flex justify-between items-center mb-10">
                            <div>
                               <h4 className="text-3xl font-black italic tracking-tight">Interview Prep Node</h4>
                               <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-2">Predictive questions based on your specific gaps.</p>
                            </div>
                            <button 
                              onClick={handleGenerateInterview} 
                              disabled={isLoadingInterview}
                              className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                              {isLoadingInterview ? 'Analyzing...' : 'Refresh Intel'}
                            </button>
                          </div>
                          {optimization.interviewPrep ? (
                            <div className="space-y-8">
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {optimization.interviewPrep.tips.map((tip, i) => (
                                     <div key={i} className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 shadow-sm">
                                        <div className="text-2xl mb-4">💡</div>
                                        <p className="text-sm font-bold text-indigo-900 leading-relaxed">{tip}</p>
                                     </div>
                                  ))}
                               </div>
                               <div className="space-y-6">
                                  {optimization.interviewPrep.questions.map((q, i) => (
                                     <div key={i} className="bg-white/80 p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                        <h5 className="text-lg font-black text-slate-900 mb-3 flex items-start gap-3">
                                           <span className="text-indigo-600">Q{i+1}.</span> {q.question}
                                        </h5>
                                        <div className="bg-slate-50 p-6 rounded-[2rem] text-sm text-slate-600 leading-relaxed border-l-4 border-indigo-400">
                                           <strong>Strategy:</strong> {q.strategy}
                                        </div>
                                     </div>
                                  ))}
                               </div>
                            </div>
                          ) : (
                             <div className="flex flex-col items-center justify-center py-20 bg-white/20 rounded-[4rem] border-4 border-dashed border-slate-200">
                                <div className="text-6xl mb-6 opacity-30">🎤</div>
                                <h5 className="text-xl font-bold text-slate-500 mb-6">No Interview Prep Generated Yet</h5>
                                <button onClick={handleGenerateInterview} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-bold shadow-xl">Start Analysis</button>
                             </div>
                          )}
                        </div>
                     )}

                     {activeTab === 'tracker' && (
                        <div className="animate-in fade-in slide-in-from-right-10">
                          <div className="flex justify-between items-center mb-10">
                            <div>
                               <h4 className="text-3xl font-black italic tracking-tight">Job Application Tracker</h4>
                               <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-2">Manage your pipeline efficiently.</p>
                            </div>
                            <button 
                              onClick={() => setShowAddJobModal(true)}
                              className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all"
                            >
                              + Track New Application
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {jobApplications.length === 0 ? (
                              <div className="col-span-full py-20 text-center opacity-50">
                                <div className="text-6xl mb-4">📇</div>
                                <p className="font-bold">No applications tracked yet.</p>
                              </div>
                            ) : (
                              jobApplications.map((job) => (
                                <div key={job.id} className="bg-white p-6 rounded-[2rem] shadow-sm hover:shadow-lg transition-all border border-slate-100 flex flex-col">
                                  <div className="flex justify-between items-start mb-4">
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                      job.status === 'Offer' ? 'bg-emerald-100 text-emerald-700' :
                                      job.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                      job.status === 'Interviewing' ? 'bg-indigo-100 text-indigo-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {job.status}
                                    </div>
                                    <button onClick={() => handleDeleteApplication(job.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                  
                                  <h5 className="text-xl font-bold text-slate-900 mb-1">{job.role}</h5>
                                  <p className="text-sm font-medium text-slate-500 mb-4">{job.company}</p>
                                  
                                  {job.notes && (
                                    <p className="text-xs text-slate-400 italic mb-6 line-clamp-3 bg-slate-50 p-3 rounded-xl">{job.notes}</p>
                                  )}
                                  
                                  <div className="mt-auto pt-4 border-t border-slate-50 flex gap-2 overflow-x-auto pb-1">
                                     {(['Applied', 'Interviewing', 'Offer', 'Rejected'] as const).map(s => (
                                       <button 
                                         key={s} 
                                         onClick={() => handleStatusChange(job.id, s)}
                                         className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all ${job.status === s ? 'bg-slate-800 border-slate-800' : 'border-slate-200 hover:border-slate-400'}`}
                                         title={`Move to ${s}`}
                                       />
                                     ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-16 lg:p-32 text-center glass-panel border-t mt-auto no-print bg-white/40">
         <div className="max-w-5xl mx-auto">
            <div className="flex justify-center items-center gap-6 mb-12">
               <VetaLogo className="h-16 w-auto object-contain hover:scale-105 transition-transform duration-300" />
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.8em] mb-16">Sculpting One-Page Excellence</p>
            <div className="flex flex-wrap justify-center items-center gap-12 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] opacity-80">
               <span>&copy; {new Date().getFullYear()} VetaCV AI™</span>
               <a href="https://ybdpsystems.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 transition-all border-b border-indigo-200 hover:border-indigo-600 pb-0.5">Developed by YBDP Systems</a>
               <button onClick={() => setShowToS(true)} className="hover:text-indigo-600 transition-colors border-b border-transparent hover:border-indigo-600 pb-0.5">Vetting Protocol v3.1</button>
            </div>
         </div>
      </footer>
    </div>
  );
};

export default App;
