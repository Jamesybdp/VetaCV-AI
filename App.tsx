
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AppStep, CareerGoals, OptimizationResult, ChatMessage } from './types';
import { GeminiService } from './services/geminiService';

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

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INITIAL);
  const [rawCV, setRawCV] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ats' | 'human' | 'linkedin' | 'branding'>('ats');
  const [goals, setGoals] = useState<CareerGoals>({
    targetRole: '',
    industry: '',
    locationPreference: '',
    moveType: 'vertical',
    jobDescription: '',
    recipientContext: ''
  });
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showBrandingInCV, setShowBrandingInCV] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showToS, setShowToS] = useState(false);
  
  const cvPreviewRef = useRef<HTMLDivElement>(null);
  const gemini = new GeminiService();

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`Copied! Vetting result ready to use.`);
  }, [showToast]);

  const handleStart = () => {
    setStep(AppStep.UPLOAD_CV);
    setRawCV('');
    setGoals({ targetRole: '', industry: '', locationPreference: '', moveType: 'vertical', jobDescription: '', recipientContext: '' });
    setOptimization(null);
    setChatMessages([]);
    setError(null);
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

  const handleGenerateBranding = async () => {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) await window.aistudio.openSelectKey();
    setIsGeneratingImage(true);
    try {
      const imageUrl = await gemini.generateBrandingImage(goals.targetRole || 'Professional', goals.industry || 'Excellence', imageSize);
      setOptimization(prev => prev ? ({ ...prev, brandingImage: imageUrl }) : null);
      setActiveTab('branding');
      showToast("Visual Synced! High-fidelity asset ready.");
    } catch (err: any) {
      showToast("Branding node failed.", 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleExportPDF = () => {
    if (!cvPreviewRef.current) return;
    showToast("This CV is a DHIRI! Tarisa CV Yako!");
    const opt = {
      margin: 0,
      filename: `Vetted_by_VetaCV_AI.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 3, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().from(cvPreviewRef.current).set(opt).save();
  };

  const handleChatSend = async (msg: string) => {
    if (!optimization || !msg.trim() || isLoading) return;
    setChatMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }]);
    setIsLoading(true);
    try {
      const response = await gemini.chatRefinement([], msg, optimization);
      setChatMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    } catch (err: any) {
      showToast("Refinement offline.", 'error');
    } finally {
      setIsLoading(false);
    }
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
          <p>By accessing or using the VetaCV AI™ software-as-a-service platform ("the Service"), including its proprietary Vetting Protocols, you ("User") agree to be bound by these Terms of Service ("ToS"). If you are using the Service on behalf of a company or entity, you represent you have the authority to bind that entity. Accessing the detailed Vetting Protocol v3.1 constitutes acknowledgment and acceptance of these terms.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">2. Description of Service</h3>
          <p>VetaCV AI™ provides an AI-powered platform that analyzes, structures, and optimizes professional curriculum vitae/resumes ("User Content") based on our proprietary, algorithmic Vetting Protocols. The Service is designed to format content for applicant tracking systems (ATS) and human reviewers. All outputs are AI-generated suggestions based on your input and are not guaranteed to result in any specific employment, interview, or career outcome.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">3. User Obligations & Content License</h3>
          <p>3.1. You retain all ownership rights to your original User Content.<br/>
          3.2. By submitting User Content, you grant VetaCV AI™ a worldwide, non-exclusive, royalty-free license to use, process, analyze, and store said content solely for the purpose of providing and improving the Service.<br/>
          3.3. You warrant that your User Content is accurate, owned by you, and does not violate any third-party rights or laws.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">4. Data Privacy & Security</h3>
          <p>4.1. Our Privacy Policy, incorporated herein by reference, details how we collect and use data.<br/>
          4.2. We implement industry-standard security measures to protect User Content. However, we cannot guarantee absolute security. You are responsible for maintaining the confidentiality of your account.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">5. Payments & Subscriptions</h3>
          <p>5.1. Access to certain features may require payment of fees.<br/>
          5.2. Fees are non-refundable except as required by law or at our sole discretion.<br/>
          5.3. We reserve the right to modify our fee structure upon prior notice.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">6. Disclaimer of Warranties & Limitation of Liability</h3>
          <p>6.1. DISCLAIMER: THE SERVICE AND ALL VETTING PROTOCOL OUTPUTS ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. VETACV AI™ EXPLICITLY DISCLAIMS ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.<br/>
          6.2. LIMITATION OF LIABILITY: TO THE MAXIMUM EXTENT PERMITTED BY LAW, VETACV AI™, ITS DEVELOPERS, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE; (B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE; OR (C) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR CONTENT.<br/>
          6.3. OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIMS UNDER THESE TOS SHALL NOT EXCEED THE AMOUNT YOU HAVE PAID TO VETACV AI™ IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO LIABILITY.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">7. AI-Specific Disclaimers</h3>
          <p>7.1. No Guarantee of Results: You acknowledge that job application success depends on numerous factors beyond CV formatting, including market conditions, interviewer preference, and specific role requirements. VetaCV AI™ does not and cannot guarantee job offers, interviews, or career advancement.<br/>
          7.2. User Responsibility for Accuracy: You are solely responsible for reviewing, verifying, and editing all AI-generated suggestions for accuracy, truthfulness, and appropriateness before using them in any application. The Service is an assistant, not a replacement for your professional judgment.<br/>
          7.3. Protocol Evolution: The underlying Vetting Protocols are subject to change, optimization, and updates at our sole discretion to improve service quality. Outputs may vary over time.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">8. Indemnification</h3>
          <p>You agree to indemnify, defend, and hold harmless VetaCV AI™ and its affiliates from any claims, damages, losses, or expenses arising from your use of the Service, your User Content, or your violation of these ToS.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">9. Termination</h3>
          <p>We may suspend or terminate your access to the Service immediately, without prior notice, for conduct we determine violates these ToS or is harmful to other users, us, or third parties, or for any other reason.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">10. Governing Law & Dispute Resolution</h3>
          <p>These ToS shall be governed by the laws of Republic of Zimbabwe. Any disputes shall be resolved in the courts located in Harare.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">11. Changes to Terms</h3>
          <p>We reserve the right to modify these ToS at any time. We will provide notice of material changes via the Service or email. Your continued use after such notice constitutes acceptance of the new terms.</p>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">12. Contact Information</h3>
          <p>For questions about these ToS, contact: [management@ybdpsystems.com]</p>
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
              Transform raw professional history into job-winning masterpieces that dominate Applicant Tracking Systems and engage elite human reviewers. Minimalist, quantified, and architected resumes for elite career opportunities.
            </p>
            <button onClick={handleStart} className="bg-slate-900 hover:bg-black text-white font-black py-6 px-20 rounded-[3rem] shadow-2xl hover:-translate-y-2 transition-all active:scale-95 flex items-center justify-center gap-4 mx-auto text-xl group">
              Start Vetting
              <svg className="h-6 w-6 transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 transition-all duration-700 relative">
            
            {/* Mobile Sidebar Backdrop */}
            {sidebarOpen && (
              <div 
                className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[70] animate-in fade-in duration-300" 
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar Refactored for Mobile (Slide from left edge) */}
            <aside className={`
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-20'} 
              fixed lg:relative inset-y-0 left-0 z-[80] lg:z-10
              lg:col-span-4 lg:translate-x-0 transition-transform duration-500 ease-in-out
              w-[85%] sm:w-[400px] lg:w-auto h-full lg:h-auto
              no-print
            `}>
              <div className="glass-panel rounded-r-[3.5rem] lg:rounded-[3.5rem] shadow-2xl p-8 lg:p-10 flex flex-col h-full lg:h-[850px] bg-white lg:bg-white/80 relative">
                 {/* Draggable Handle Visual Cue */}
                 <div className="lg:hidden absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 opacity-30">
                    {[1, 2, 3].map(i => <div key={i} className="w-1 h-8 bg-slate-900 rounded-full" />)}
                 </div>

                 <div className="flex justify-between items-center mb-12">
                    <div className="flex items-center gap-4">
                      <VetaLogo className="p-1.5 w-10 h-10" />
                      <h5 className="font-black text-slate-900 text-sm tracking-tight">Refinement</h5>
                    </div>
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-3 text-slate-300 hover:text-indigo-600 transition-all bg-white/40 rounded-2xl shadow-sm">
                       <svg className={`h-6 w-6 transform transition-all duration-700 ${sidebarOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 19l-7-7 7-7" /></svg>
                    </button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto space-y-6 mb-10 pr-3 custom-scrollbar min-h-0">
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-3`}>
                         <div className={`max-w-[85%] p-5 rounded-[1.5rem] text-[11px] font-bold leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none shadow-xl' : 'bg-white/70 text-slate-800 border border-white/40 rounded-bl-none shadow-sm'}`}>
                            {m.content}
                         </div>
                      </div>
                    ))}
                    {isLoading && <div className="animate-pulse flex gap-2.5 p-4"><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full"></div><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full"></div><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full"></div></div>}
                 </div>
                 <form onSubmit={(e) => { e.preventDefault(); const inp = (e.target as any).msg; if (inp.value.trim()) { handleChatSend(inp.value); inp.value=''; } }} className="relative group/input mt-auto">
                    <input name="msg" autoComplete="off" disabled={isLoading} className="w-full p-6 pr-16 bg-white/60 border border-white/40 rounded-[2.5rem] outline-none text-xs font-black shadow-inner transition-all focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600" placeholder="Direct refinement..." />
                    <button type="submit" disabled={isLoading} className="absolute right-2.5 top-2.5 bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl hover:scale-105 active:scale-90 transition-all"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m-7-7v18" /></svg></button>
                 </form>
              </div>
            </aside>

            {/* Document Workspace */}
            <div className={`${sidebarOpen ? 'lg:col-span-8' : 'lg:col-span-11'} flex-1 space-y-8 lg:space-y-12 transition-all duration-700`}>
               <div className="glass-panel rounded-[4rem] shadow-elite min-h-[900px] flex flex-col border border-white/40 overflow-hidden">
                  <nav className="flex bg-white/30 border-b no-print overflow-x-auto custom-scrollbar">
                     {[
                        { id: 'ats', label: 'ATS Vetting' },
                        { id: 'human', label: 'Elite Archive' },
                        { id: 'linkedin', label: 'Sync Node' },
                        { id: 'branding', label: 'Visual Hub' }
                     ].map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex-1 min-w-[130px] py-9 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-b-4 ${activeTab === t.id ? 'border-indigo-600 text-indigo-600 bg-white shadow-inner' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/40'}`}>
                           {t.label}
                        </button>
                     ))}
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
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-2">Discouraging clutter. Maximizing impact.</p>
                             </div>
                             <div className="flex flex-wrap gap-4 w-full sm:w-auto">
                                <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-white border-2 text-[10px] font-black px-8 py-4 rounded-[1.5rem] hover:border-indigo-600 transition-all flex items-center justify-center gap-3 shadow-sm">
                                   Print
                                </button>
                                <button onClick={handleExportPDF} className="flex-1 sm:flex-none bg-indigo-600 text-white text-[10px] font-black px-12 py-5 rounded-[1.5rem] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">Download PDF</button>
                             </div>
                          </div>
                          <div ref={cvPreviewRef} className="paper-canvas mx-auto p-12 lg:p-24 max-w-[850px] rounded-sm min-h-[1200px] overflow-hidden transform hover:scale-[1.005] transition-all">
                             {optimization.brandingImage && showBrandingInCV && (
                               <div className="mb-14 rounded-[3rem] overflow-hidden border-[10px] border-slate-50 shadow-2xl">
                                  <img src={optimization.brandingImage} className="w-full h-52 lg:h-64 object-cover" alt="VetaCV Branding" />
                               </div>
                             )}
                             <div className="serif-cv text-justify" dangerouslySetInnerHTML={{ __html: optimization.humanVersion }} />
                             <div className="veta-badge no-print">
                                <VetaLogo className="w-4 h-4 p-0.5" />
                                Vetted by VetaCV AI™
                             </div>
                             {/* Badge for PDF generation specifically */}
                             <div className="hidden print:flex veta-badge">
                                Vetted by VetaCV AI™
                             </div>
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
                                <label className="relative cursor-pointer bg-white border-2 border-slate-100 rounded-[2rem] px-8 py-5 text-xs font-black shadow-xl hover:border-indigo-600 transition-all group/template">
                                   <span>Vetting Template Node</span>
                                   <input type="file" onChange={(e) => handleFileUpload(e, 'template')} className="hidden" />
                                </label>
                                <button onClick={handleGenerateBranding} disabled={isGeneratingImage} className="bg-slate-900 text-white font-black px-12 py-5 rounded-[2rem] text-xs hover:bg-black transition-all shadow-2xl disabled:opacity-40 active:scale-95">
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
               <span className="hover:text-indigo-600 transition-colors">Harare Node: ONLINE</span>
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
