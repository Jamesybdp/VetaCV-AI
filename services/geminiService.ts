
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { CareerGoals, OptimizationResult } from "../types";

const SYSTEM_PROMPT = `You are VetaCV AI™, the elite CV vetting engine for Zimbabwe and the SADC region. 
Your mission: Vet raw professional history into high-impact, job-winning masterpieces. 

VOICE & TONE:
- Professional yet culturally resonant. 
- Incorporate subtle Shonglish flavor in your digital summaries to sound local yet globally competent.
- Target audience: Remote workers (first-timers or experienced), university students, and Zim professionals.

VETTING PRINCIPLES:
- First-Principles Architecture: Deconstruct duties; reconstruct as Quantified Achievements.
- Minimalism: Discourage clutter and over-design. Aim for "One-Pager Excellence". 2 pages is the absolute limit.
- Typography Focus: Suggest clean layouts that prioritize reading flow over graphics.
- Direct Copywriting: Use active verbs. No "responsible for". Use "Architected", "Engineered", "Dominated", "Spearheaded".

RECIPIENT ALIGNMENT:
Tailor tone for specific local giants (Econet, Delta, Zimworx) or global remote companies. Ensure the generated CV reflects excellence without gimmicks.

Return strictly JSON.`;

export class GeminiService {
  async optimizeCV(rawCV: string, goals: CareerGoals): Promise<OptimizationResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      VETTING REQUEST:
      RAW CV: ${rawCV}
      JOB DESCRIPTION: ${goals.jobDescription}
      TARGET: ${goals.recipientContext || 'General Market'}
      LOCATION PREFERENCE: ${goals.locationPreference || 'Zim/Remote'}
      
      Tasks:
      1. Perform deep vetting to extract accomplishments.
      2. Align keywords for Zim/SADC and Global Remote standards.
      3. Create a clean HTML layout (humanVersion) following minimalist typography (standard serif fonts, hierarchical headings).
      
      Generate:
      1. atsVersion: Standardized scanner-ready text.
      2. humanVersion: Semantic HTML with VetaCV typography principles.
      3. digitalSync: Shonglish-infused LinkedIn sync (headline, summary, skills).
      4. analysis: How this CV "Vets" against the market requirements.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            atsVersion: { type: Type.STRING },
            humanVersion: { type: Type.STRING },
            digitalSync: {
              type: Type.OBJECT,
              properties: {
                linkedinHeadline: { type: Type.STRING },
                linkedinSummary: { type: Type.STRING },
                suggestedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                portfolioPrompts: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["linkedinHeadline", "linkedinSummary", "suggestedSkills", "portfolioPrompts"]
            },
            analysis: {
              type: Type.OBJECT,
              properties: {
                keywordImpact: { type: Type.STRING },
                narrativeAlignment: { type: Type.STRING },
                atsCompatibility: { type: Type.STRING }
              },
              required: ["keywordImpact", "narrativeAlignment", "atsCompatibility"]
            }
          },
          required: ["atsVersion", "humanVersion", "digitalSync", "analysis"]
        }
      }
    });

    try {
      const data = JSON.parse(response.text || '{}');
      const sources: { title: string; uri: string }[] = [];
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        groundingChunks.forEach((chunk: any) => {
          if (chunk.web?.uri && chunk.web?.title) {
            sources.push({ title: chunk.web.title, uri: chunk.web.uri });
          }
        });
      }
      return { ...data, sources };
    } catch (e) {
      throw new Error("Vetting failed. System collision.");
    }
  }

  async generateBrandingImage(role: string, industry: string, size: "1K" | "2K" | "4K"): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `A professional, minimalist abstract visual for a career in ${role}. Theme: Innovation, Growth, Excellence. Sophisticated palette: Charcoal, Deep Emerald, Gold accents. High-end minimal art.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "16:9", imageSize: size } },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Branding synthesis failed.");
  }

  async chatRefinement(history: any[], newMessage: string, currentContext: OptimizationResult): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: { systemInstruction: SYSTEM_PROMPT }
    });
    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "VetaCV Node offline.";
  }
}
