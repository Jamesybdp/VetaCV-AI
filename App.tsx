
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AppStep, CareerGoals, OptimizationResult, ChatMessage, JobApplication } from './types';
import { GeminiService } from './services/geminiService';
import { RefinementService, RefinementResult } from './services/refinementService';
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

const VetaLogo: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`flex items-center justify-center bg-slate-900 rounded-xl ${className || 'p-2'}`}>
    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4L12 20L20 4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 20L15 14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </div>
);

// PDF Health Dashboard Component
const PDFHealthDashboard: React.FC<{
  health: 'healthy' | 'warning' | 'critical';
  errors: string[];
  recentExports: any[];
  onClear: () => void;
}> = ({ health, errors, recentExports, onClear }) => (
  <div style={{
    position: 'fixed',
    bottom: 120,
    right: 20,
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    width: '300px',
    maxHeight: '400px',
    overflowY: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 9999,
    fontSize: '12px'
  }}>
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      borderBottom: '1px solid #eee',
      paddingBottom: '8px'
    }}>
      <strong>📊 PDF Health Dashboard</strong>
      <div style={{
        padding: '4px 8px',
        borderRadius: '12px',
        background: health === 'healthy' ? '#d4edda' : 
                   health === 'warning' ? '#fff3cd' : '#f8d7da',
        color: health === 'healthy' ? '#155724' : 
               health === 'warning' ? '#856404' : '#721c24',
        fontSize: '10px'
      }}>
        {health.toUpperCase()}
      </div>
    </div>
    
    {errors.length > 0 && (
      <div style={{ 
        background: '#f8d7da', 
        color: '#721c24',
        padding: '8px',
        borderRadius: '4px',
        marginBottom: '10px',
        fontSize: '11px'
      }}>
        <strong>⚠️ Active Errors:</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
          {errors.slice(0, 3).map((error, i) => (
            <li key={i}>{error.substring(0, 60)}...</li>
          ))}
        </ul>
      </div>
    )}
    
    <div style={{ marginBottom: '10px' }}>
      <strong>Recent Exports:</strong>
      {recentExports.length === 0 ? (
        <div style={{ color: '#6c757d', fontStyle: 'italic', marginTop: '5px' }}>
          No exports yet
        </div>
      ) : (
        <div style={{ marginTop: '5px' }}>
          {recentExports.map((exportItem, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 0',
              borderBottom: i < recentExports.length - 1 ? '1px solid #f0f0f0' : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: exportItem.success ? 
                            (exportItem.health === 'excellent' ? '#28a745' : 
                             exportItem.health === 'good' ? '#ffc107' : '#dc3545') : 
                            '#dc3545',
                  marginRight: '6px'
                }} />
                <span style={{ 
                  color: exportItem.success ? '#333' : '#dc3545',
                  fontSize: '11px'
                }}>
                  {new Date(exportItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                {exportItem.fixesApplied > 0 && `🔧${exportItem.fixesApplied}`}
                {exportItem.warnings > 0 && ` ⚠️${exportItem.warnings}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    
    <button 
      onClick={onClear}
      style={{
        width: '100%',
        padding: '6px',
        background: '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        fontSize: '11px',
        cursor: 'pointer',
        marginTop: '5px'
      }}
    >
      Clear Dashboard
    </button>
  </div>
);

// Data Collection Modal Component
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
            The Vetting Engine detected placeholder data. Please provide the missing details to finalize your document.
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
            
            {(missingFields.includes('linkedin') || !missingFields.length) && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">LinkedIn Profile (Optional)</label>
                <input name="linkedin" value={formData.linkedin} onChange={handleChange} placeholder="e.g. linkedin.com/in/username" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-700" />
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  
  // PDF Health Monitoring States
  const [pdfHealth, setPdfHealth] = useState<'healthy' | 'warning' | 'critical'>('healthy');
  const [pdfErrors, setPdfErrors] = useState<string[]>([]);
  const [recentExports, setRecentExports] = useState<any[]>([]);
  
  const cvPreviewRef = useRef<HTMLDivElement>(null);
  const gemini = new GeminiService();

  // Run Test Suite on Mount (Dev Mode)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      runPDFTestSuite().then(results => console.log('✅ PDF Test Suite Initialization', results));
    }
  }, []);

  // Persistence Logic: Load
  useEffect(() => {
    const saved = localStorage.getItem('veta_state');
    if (saved && isInitialLoad) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step) setStep(parsed.step);
        if (parsed.rawCV) setRawCV(parsed.rawCV);
        if (parsed.goals) setGoals(parsed.goals);
        if (parsed.optimization) {
          setOptimization(parsed.optimization);
          setHistory([parsed.optimization]);
          setHistoryIndex(0);
        }
        if (parsed.agreedToTerms) setAgreedToTerms(parsed.agreedToTerms);
        if (parsed.jobApplications) setJobApplications(parsed.jobApplications);
        showToast("Session restored. Welcome back!");
      } catch (e) {
        console.error("Failed to restore session", e);
      }
      setIsInitialLoad(false);
    }
  }, []);

  // Persistence Logic: Save
  useEffect(() => {
    if (isInitialLoad) return;
    const timeout = setTimeout(() => {
      const stateToSave = {
        step,
        rawCV,
        goals,
        optimization,
        agreedToTerms,
        jobApplications
      };
      localStorage.setItem('veta_state', JSON.stringify(stateToSave));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [step, rawCV, goals, optimization, agreedToTerms, jobApplications, isInitialLoad]);

  // Undo/Redo Logic
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

  // Job Tracker Logic
  const handleAddApplication = () => {
    if (!newJob.company || !newJob.role) {
      showToast("Company and Role are required.", 'error');
      return;
    }
    const application: JobApplication = {
      id: Date.now().toString(),
      company: newJob.company,
      role: newJob.role,
      status: newJob.status as any || 'Applied',
      dateApplied: new Date().toISOString(),
      notes: newJob.notes || ''
    };
    setJobApplications(prev => [application, ...prev]);
    setShowAddJobModal(false);
    setNewJob({ status: 'Applied' });
    showToast("Application tracked.");
  };

  const handleDeleteApplication = (id: string) => {
    if (window.confirm("Remove this application from tracking?")) {
      setJobApplications(prev => prev.filter(app => app.id !== id));
      showToast("Application removed.");
    }
  };

  const handleStatusChange = (id: string, newStatus: JobApplication['status']) => {
    setJobApplications(prev => prev.map(app => 
      app.id === id ? { ...app, status: newStatus } : app
    ));
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

  const monitorPdfHealth = (html: string, stage: string): boolean => {
    const errors: string[] = [];
    
    // Health check 1: Check for common corruption patterns (Random case mixing)
    if (html.match(/[a-z][A-Z][a-z][A-Z]/g)) {
      errors.push(`Random case mixing detected at ${stage}`);
    }
    
    // Health check 2: Check for truncated content
    const lines = html.split('\n');
    const truncatedLines = lines.filter(line => 
      line.length > 50 && line.endsWith('-')
    );
    if (truncatedLines.length > 2) {
      errors.push(`Multiple truncated lines detected at ${stage}`);
    }
    
    // Health check 3: Check HTML structure balance
    const divCount = (html.match(/<div/g) || []).length;
    const closingDivCount = (html.match(/<\/div>/g) || []).length;
    if (divCount !== closingDivCount) {
      errors.push(`HTML div tag mismatch: ${divCount} opening, ${closingDivCount} closing`);
    }
    
    if (errors.length > 0) {
      setPdfErrors(prev => [...prev, ...errors]);
      setPdfHealth(errors.length > 3 ? 'critical' : 'warning');
      errors.forEach(error => console.warn(`PDF Health: ${error}`));
      return false;
    }
    
    setPdfHealth('healthy');
    return true;
  };

  const exportAsTextFile = (data: OptimizationResult) => {
    const element = document.createElement("a");
    const file = new Blob([data.atsVersion], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `VetaCV_${goals.targetRole.replace(/\s+/g, '_')}_Text_Backup.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Fallback: Text version downloaded.");
  };

  const exportAsWordDocument = (data: OptimizationResult) => {
    // Simple HTML export with .doc extension as a fallback
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML to Word Document with JavaScript</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + data.humanVersion + footer;
    
    const element = document.createElement("a");
    const file = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    element.href = URL.createObjectURL(file);
    element.download = `VetaCV_${goals.targetRole.replace(/\s+/g, '_')}_Word_Fallback.doc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Fallback: Legacy Word doc downloaded.");
  };

  const handlePDFFallback = async (cvData: OptimizationResult) => {
    const choice = window.confirm(
      'PDF export failed or file is corrupted.\n\n' +
      'Click OK to download a TEXT backup (Recommended).\n' +
      'Click Cancel to try a basic WORD export.'
    );
    
    if (choice) {
      exportAsTextFile(cvData);
    } else {
      exportAsWordDocument(cvData);
    }
  };

  const logExport = (success: boolean, fixes: number, warnings: string[]) => {
    setRecentExports(prev => [
      {
        timestamp: new Date().toISOString(),
        success,
        fixesApplied: fixes,
        warnings: warnings.length,
        health: fixes === 0 && warnings.length === 0 ? 'excellent' : 
                fixes < 3 ? 'good' : 'needs_attention'
      },
      ...prev.slice(0, 9)
    ]);
  };

  const handleStart = () => {
    setStep(AppStep.UPLOAD_CV);
    setRawCV('');
    setGoals({ targetRole: '', industry: '', locationPreference: '', moveType: 'vertical', jobDescription: '', recipientContext: '' });
    setOptimization(null);
    setError(null);
    setShowDataForm(false);
    setPdfErrors([]);
    setPdfHealth('healthy');
    setHistory([]);
    setHistoryIndex(-1);
    setJobApplications([]);
    localStorage.removeItem('veta_state'); // Clear persistence on fresh start
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
      addToHistory(result); // Init history
      
      const validation = validateCVData(result.humanVersion);
      if (!validation.valid) {
        setMissingDataFields(validation.missing);
        setShowDataForm(true);
      }

      setStep(AppStep.DASHBOARD);
      showToast("Vetting Node: COMPLETE. Result optimized.");
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

  const handleExportPDF = async () => {
    if (!optimization?.humanVersion) {
      showToast("No CV content available to export.", "error");
      return;
    }

    // Health Check 1: Pre-Sanitization
    if (!monitorPdfHealth(optimization.humanVersion, 'pre-sanitization')) {
      console.warn('Proceeding with unhealthy input - may need fallback');
    }

    // STEP 1: SANITIZE HTML
    debugHtmlStructure(optimization.humanVersion);
    const result = sanitizeHtmlForPdf(optimization.humanVersion);
    setSanitizationResult(result);
    
    // Health Check 2: Post-Sanitization
    if (!monitorPdfHealth(result.html, 'post-sanitization')) {
       await handlePDFFallback(optimization);
       logExport(false, result.fixesApplied, ['Health check failed post-sanitization']);
       return;
    }

    if (result.fixesApplied > 0) {
      console.log(`Applied ${result.fixesApplied} fixes to HTML structure`);
    }

    // STEP 2: ADD BADGE IF ENABLED
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

    // STEP 3: GENERATE PDF
    const element = document.createElement('div');
    element.innerHTML = finalHtml;
    document.body.appendChild(element); 

    try {
      showToast("Rendering High-Fidelity PDF...");
      
      const opt = {
        margin: [10, 10, 10, 10], // Slightly reduced margin to fit content better
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
        // Updated to use 'smart' page breaking if available or legacy CSS mode
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, hotfixes: ['px_scaling'] },
        pagebreak: { 
          mode: ['css', 'legacy'], // Legacy mode often handles complex layouts better than avoid-all
          before: '.page-break',
          avoid: ['h1', 'h2', 'h3', 'li', 'table', '.keep-together'] 
        }
      };

      await html2pdf().set(opt).from(element).save();
      showToast("Download Complete. Tarisa CV Yako!");
      logExport(true, result.fixesApplied, result.warnings);
    } catch (e: any) {
      console.error(e);
      showToast("PDF Generation Failed. Initiating fallback...", "error");
      await handlePDFFallback(optimization);
      logExport(false, result.fixesApplied, [e.message]);
    } finally {
      if (element.parentNode) {
        document.body.removeChild(element);
      }
    }
  };

  // Handler for when refinement completes from the chat bubble
  const handleRefinementComplete = (result: RefinementResult) => {
    if (!optimization) return;
    
    // Update state with refined CV
    const newState = {
      ...optimization,
      humanVersion: result.humanVersion,
      // Update summary if changed, using the digitalSummary field which usually maps to LinkedIn summary or profile
      digitalSync: {
        ...optimization.digitalSync,
        linkedinSummary: result.digitalSummary 
      }
    };
    
    setOptimization(newState);
    addToHistory(newState);
    showToast("Refinement Applied Successfully!");
  };

  const recipientSuggestions = ["Econet", "Delta Beverages", "Zimworx", "Old Mutual", "Cassava", "RemoteGlobal"];
  const locationSuggestions = ["Harare", "Bulawayo", "Remote (Global)", "Johannesburg"];

  const ProgressTracker = () => (
    <div className="flex items-center gap-3 no-print">
      {[AppStep.UPLOAD_CV, AppStep.TARGET_ROLE, AppStep.DASHBOARD].map((s, idx) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${step === s ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-200 text-slate-500'}`}>
            {idx + 1}
          </div>
          <span className={`hidden sm:inline text-[9px] font-black uppercase tracking-widest ${step === s ? 'text-slate-900' : 'text-slate-400'}`}>
            {idx === 0 ? "Source" : idx === 1 ? "Alignment" : "Vetted"}
          </span>
        </div>
      ))}
    </div>
  );

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
      {/* Iridescent Toaster */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-6 duration-300">
          <div className={`px-10 py-5 rounded-[2.5rem] shadow-2xl flex items-center gap-4 text-xs font-black uppercase tracking-[0.2em] glass-panel border-2 ${toast.type === 'success' ? 'border-indigo-500/50 text-slate-900' : 'border-red-500/50 text-red-600'}`}>
            {toast.type === 'success' ? <span className="text-xl">✨</span> : <span className="text-xl">⚠️</span>} {toast.message}
          </div>
        </div>
      )}
      
      {/* Dev Mode PDF Health Dashboard */}
      {process.env.NODE_ENV === 'development' && (
        <PDFHealthDashboard 
          health={pdfHealth}
          errors={pdfErrors}
          recentExports={recentExports}
          onClear={() => {
            setRecentExports([]);
            setPdfErrors([]);
            setPdfHealth('healthy');
          }}
        />
      )}

      {/* Data Collection Modal */}
      {showDataForm && (
        <DataCollectionForm 
          missingFields={missingDataFields}
          onSave={handleDataInjection}
          onCancel={() => setShowDataForm(false)}
        />
      )}

      {/* Add Job Modal */}
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

      {/* Terms of Service Overlay Modal */}
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

      {/* Iridescent Header */}
      <header className="sticky top-0 z-[60] glass-panel border-b px-6 lg:px-16 py-6 flex justify-between items-center no-print bg-white/60">
        <div className="flex items-center gap-5">
          <div className="lg:hidden mr-2">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-900 hover:text-indigo-600 transition-all bg-white/40 rounded-xl shadow-sm">
               <svg className={`h-6 w-6 transform transition-all duration-300 ${sidebarOpen ? 'rotate-90' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
               </svg>
            </button>
          </div>
          <VetaLogo />
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter italic">VetaCV <span className="text-indigo-600">AI™</span></h1>
        </div>
        <ProgressTracker />
        <div className="flex items-center gap-4 mobile-hide">
          <div className="flex items-center gap-3 bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-2xl">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-black uppercase tracking-[0.3em]">Status: OPTIMIZED</span>
          </div>
        </div>
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
             <div className="w-32 h-32 bg-slate-900 rounded-[3rem] mx-auto mb-12 flex items-center justify-center animate-bounce shadow-2xl">
                <VetaLogo className="p-4" />
             </div>
             <h4 className="text-5xl font-black text-slate-900 mb-6 tracking-tighter italic">Vetting Narrative Node...</h4>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] animate-pulse">Wait for the DHIRI • Architecture in progress</p>
          </div>
        )}

        {step === AppStep.DASHBOARD && optimization && (
          <div className="relative">
            {/* New Floating Refinement Chat */}
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

            {/* Document Workspace (Full Width now that sidebar is gone) */}
            <div className="flex-1 space-y-8 lg:space-y-12 transition-all duration-700 max-w-[1400px] mx-auto">
               <div className="glass-panel rounded-[4rem] shadow-elite min-h-[900px] flex flex-col border border-white/40 overflow-hidden">
                  <nav className="flex bg-white/30 border-b no-print overflow-x-auto custom-scrollbar relative">
                     <div className="hidden lg:flex items-center px-6 border-r border-white/20">
                       <div className="flex gap-2">
                          <button 
                            onClick={handleUndo} 
                            disabled={historyIndex <= 0}
                            className="p-2 bg-white/50 rounded-xl hover:bg-white text-slate-600 disabled:opacity-30 transition-all"
                            title="Undo"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                          </button>
                          <button 
                            onClick={handleRedo}
                            disabled={historyIndex >= history.length - 1} 
                            className="p-2 bg-white/50 rounded-xl hover:bg-white text-slate-600 disabled:opacity-30 transition-all"
                            title="Redo"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                          </button>
                       </div>
                     </div>
                     {[
                        { id: 'ats', label: 'ATS Vetting' },
                        { id: 'human', label: 'Elite Archive' },
                        { id: 'linkedin', label: 'Sync Node' },
                        { id: 'branding', label: 'Visual Hub' },
                        { id: 'cover-letter', label: 'Cover Letter' },
                        { id: 'interview', label: 'Interview Prep' },
                        { id: 'tracker', label: 'Job Tracker' }
                     ].map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex-1 min-w-[130px] py-9 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-b-4 ${activeTab === t.id ? 'border-indigo-600 text-indigo-600 bg-white shadow-inner' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/40'}`}>
                           {t.label}
                        </button>
                     ))}
                  </nav>

                  <div className="flex-1 p-6 lg:p-14 overflow-y-auto max-h-[1400px] custom-scrollbar bg-white/10">
                     {activeTab === 'ats' && (
                       // ... existing ATS content ...
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
                             <div className="flex flex-wrap gap-4 w-full sm:w-auto">
                                <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-white border-2 text-[10px] font-black px-8 py-4 rounded-[1.5rem] hover:border-indigo-600 transition-all flex items-center justify-center gap-3 shadow-sm">
                                   Print
                                </button>
                                <button onClick={handleExportPDF} className="flex-1 sm:flex-none bg-indigo-600 text-white text-[10px] font-black px-12 py-5 rounded-[1.5rem] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">Download PDF</button>
                             </div>
                          </div>
                          <div ref={cvPreviewRef} className="paper-canvas mx-auto p-12 lg:p-24 w-full max-w-[850px] rounded-sm min-h-[1200px] overflow-hidden transform hover:scale-[1.005] transition-all bg-white">
                             {optimization.brandingImage && showBrandingInCV && (
                               <div className="mb-14 rounded-[3rem] overflow-hidden border-[10px] border-slate-50 shadow-2xl">
                                  <img src={optimization.brandingImage} className="w-full h-52 lg:h-64 object-cover" alt="VetaCV Branding" />
                               </div>
                             )}
                             
                             {/* Interactive WYSIWYG Editor */}
                             <div 
                               contentEditable={true}
                               suppressContentEditableWarning={true}
                               onBlur={(e) => handleManualEdit(e.currentTarget.innerHTML)}
                               className="serif-cv text-justify outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-8 rounded-lg transition-all"
                               dangerouslySetInnerHTML={{ __html: optimization.humanVersion }} 
                             />
                             
                             {showDigitalBadge && (
                               <>
                                 <div className="veta-badge no-print">
                                    <VetaLogo className="w-4 h-4 p-0.5" />
                                    Vetted by VetaCV AI™
                                 </div>
                                 <div className="hidden print:flex veta-badge">
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
                           
                           {/* New Vetting Prompts Section */}
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
                               {/* Tips Section */}
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {optimization.interviewPrep.tips.map((tip, i) => (
                                     <div key={i} className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 shadow-sm">
                                        <div className="text-2xl mb-4">💡</div>
                                        <p className="text-sm font-bold text-indigo-900 leading-relaxed">{tip}</p>
                                     </div>
                                  ))}
                               </div>
                               
                               {/* Questions */}
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

      {/* Iridescent Footer */}
      <footer className="p-16 lg:p-32 text-center glass-panel border-t mt-auto no-print bg-white/40">
         <div className="max-w-5xl mx-auto">
            <div className="flex justify-center items-center gap-6 mb-12">
               <VetaLogo className="p-3 w-12 h-12" />
               <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic">VetaCV <span className="text-indigo-600">AI™</span></h1>
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
