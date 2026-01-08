
export enum AppStep {
  INITIAL = 'INITIAL',
  UPLOAD_CV = 'UPLOAD_CV',
  TARGET_ROLE = 'TARGET_ROLE',
  ANALYZING = 'ANALYZING',
  DASHBOARD = 'DASHBOARD'
}

export interface CareerGoals {
  targetRole: string; // Still used for internal logic and naming
  industry: string; // Now used for Industry Preferences
  locationPreference?: string; // New field for location
  moveType: 'vertical' | 'lateral' | 'pivot';
  jobDescription: string; // Now a primary input
  jobLink?: string;
  topRequirements?: string[];
  uniqueValue?: string;
  developingSkills?: string;
  recipientContext?: string; // Target Company
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
  };
  analysis: {
    keywordImpact: string;
    narrativeAlignment: string;
    atsCompatibility: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
