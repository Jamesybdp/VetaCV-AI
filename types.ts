
export enum AppStep {
  INITIAL = 'INITIAL',
  UPLOAD_CV = 'UPLOAD_CV',
  TARGET_ROLE = 'TARGET_ROLE',
  ANALYZING = 'ANALYZING',
  DASHBOARD = 'DASHBOARD',
  PROFILE = 'PROFILE'
}

export interface CareerGoals {
  targetRole: string;
  industry: string;
  locationPreference?: string;
  moveType: 'vertical' | 'lateral' | 'pivot';
  jobDescription: string;
  jobLink?: string;
  topRequirements?: string[];
  uniqueValue?: string;
  developingSkills?: string;
  recipientContext?: string;
}

export interface OptimizationResult {
  atsVersion: string;
  humanVersion: string;
  brandingImage?: string;
  sources?: { title: string; uri: string }[];
  digitalSync: {
    linkedinHeadline: string;
    linkedinSummary: string;
    suggestedSkills: string[];
    portfolioPrompts: string[];
    brandingPrompts: string[]; // 3 specific prompts for portfolio focus or interview responses
  };
  analysis: {
    keywordImpact: string;
    narrativeAlignment: string;
    atsCompatibility: string;
  };
  // New Features
  coverLetter?: string;
  interviewPrep?: {
    questions: { question: string; strategy: string }[];
    tips: string[];
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface JobApplication {
  id: string;
  userId?: string; // Prepared for backend
  company: string;
  role: string;
  status: 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';
  dateApplied: string;
  notes?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number; // Positive for purchase, negative for usage
  type: 'purchase' | 'usage' | 'bonus';
}

export interface SavedCV {
  id: string;
  userId: string;
  dateCreated: string;
  targetRole: string;
  previewText: string;
  data: OptimizationResult;
  goals: CareerGoals;
}

export interface UserProfile {
  id: string; // UUID
  isAnonymous: boolean;
  name: string;
  email: string;
  tokens: number;
  plan: 'Free' | 'Starter' | 'Standard' | 'Pro' | 'Unlimited';
  autoApplyCredits: {
    used: number;
    total: number;
  };
  transactions: Transaction[];
  savedCVs: SavedCV[];
}

export interface PricingPlan {
  id: string;
  name: string;
  credits: number | '∞';
  price: number;
  tag?: string;
  color: string;
  features: string[];
}
