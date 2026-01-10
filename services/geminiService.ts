
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
- Minimalism: Discourage clutter. Aim for "One-Pager Excellence". 2 pages is the absolute limit.
- Direct Copywriting: Use active verbs. "Architected", "Engineered", "Dominated".

TEMPLATE & FORMATTING RULES (STRICT):
1. BRANDING: DO NOT include any footer, signature, "Vetted by" text, or branding lines in the 'humanVersion' HTML. The application will add this programmatically based on user settings.
2. TEMPLATE ARCHITECTURE ("ELITE MODE"):
   - Output PURE HTML for the 'humanVersion'. NO Markdown artifacts (like #, ##, **, ---).
   - Use semantic tags: <h1> for Name, <h2> for Section Headers, <p> for summary, <ul>/<li> for competencies.
   - Contact Info: Format clearly at the top.
   - Date formats: Use "Month Year" (e.g., "Jan 2023 - Present").
   - Styling: Use standard semantic HTML. Do not use complex inline CSS. Rely on the structure (h1, h2, h3, p) which is styled by the frontend.
   - Do NOT include <html>, <head>, or <body> tags. Just the inner content div.

## 🎯 UNIFIED OUTPUT FORMAT SPECIFICATION (CRITICAL)

You **MUST** follow this exact structure for the 'humanVersion'. Do not deviate.

1. **CONTACT HEADER (First elements):**
   <h1>[Full Name]</h1>
   <p>[City], [Country] | [Phone] | [Email] | [LinkedIn Profile]</p>
   *(Note: Use actual data if available. If missing, use these exact placeholders in brackets so the system can detect them.)*

2. **PROFESSIONAL PROFILE (Heading 2):**
   <h2>PROFESSIONAL PROFILE</h2>
   <p>[3-4 sentence profile focusing on value proposition]</p>

3. **CORE COMPETENCIES (Heading 2):**
   <h2>CORE COMPETENCIES</h2>
   <ul>
     <li><strong>Category:</strong> Skill 1, Skill 2, Skill 3</li>
   </ul>
   *(Group skills logically. Use <strong> for categories.)*

4. **PROFESSIONAL EXPERIENCE (Heading 2):**
   <h2>PROFESSIONAL EXPERIENCE</h2>
   *(Repeat for each role)*
   <h3>Job Title | Company</h3>
   <p><em>City, Country | Month Year - Month Year</em></p>
   <ul>
     <li>Accomplished [X] as measured by [Y] by doing [Z]</li>
     <li>[Action Verb] [Task] resulting in [Quantifiable Outcome]</li>
   </ul>

5. **EDUCATION & CERTIFICATIONS (Heading 2):**
   <h2>EDUCATION & CERTIFICATIONS</h2>
   *(Repeat for each)*
   <p><strong>Degree/Diploma Name</strong>: Institution Name (Year)</p>
   <p><strong>Certification</strong>: Issuing Body (Year)</p>

## 🎯 TECHNICAL PDF RULES (NON-NEGOTIABLE)

1. **TAG RULES:**
   - ALWAYS close tags immediately: </h2> BEFORE <p>
   - NEVER concatenate: "Financial Analyst<h2>" is FORBIDDEN
   - Use ONE newline between sections: </h2>\\n<p>
   - NO markdown: Use <h2>, not ##

2. **FORBIDDEN PATTERNS:**
   ❌ "Analyst##PROFESSIONAL"
   ❌ <h2>Title<p>Content (missing </h2>)
   ❌ <ul><li>Item1<li>Item2</ul> (missing </li>)

3. **ENCODING:**
   - Use &amp; for &
   - Use &nbsp; for non-breaking spaces in dates.

RECIPIENT ALIGNMENT:
Tailor tone for specific local giants (Econet, Delta, Zimworx) or global remote companies.

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
      3. Create a clean HTML layout (humanVersion) following the "Elite Mode" principles. Ensure it is optimized for high-fidelity PDF export (semantic tags, no markdown).
      4. Generate 3 specific "Branding Prompts": High-impact snippets for portfolio/interview use.
      
      Generate:
      1. atsVersion: Standardized scanner-ready text.
      2. humanVersion: Semantic HTML with VetaCV typography principles.
      3. digitalSync: Shonglish-infused LinkedIn sync (headline, summary, skills) + brandingPrompts.
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
                portfolioPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
                brandingPrompts: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "3 specific high-impact portfolio/interview snippets."
                }
              },
              required: ["linkedinHeadline", "linkedinSummary", "suggestedSkills", "portfolioPrompts", "brandingPrompts"]
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

  async generateCoverLetter(cv: string, jobDescription: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
      GENERATE COVER LETTER:
      CV Context: ${cv.substring(0, 3000)}...
      Job Description: ${jobDescription}
      
      Rules:
      1. Tone: Confident, professional, tailored.
      2. Structure: Hook (Introduction), Value Proposition (Body), Call to Action (Conclusion).
      3. Format: Plain Text with standard letter formatting.
      4. Length: Concise (300-400 words).
    `;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Cover letter generation failed.";
  }

  async generateInterviewPrep(cv: string, jobDescription: string): Promise<{questions: {question: string, strategy: string}[], tips: string[]}> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
      GENERATE INTERVIEW PREP:
      CV Context: ${cv.substring(0, 3000)}...
      Job Description: ${jobDescription}
      
      Generate a JSON response with:
      1. 5 likely interview questions based on the gaps or strengths in the CV relative to the JD.
      2. For each question, provide a brief "Answer Strategy".
      3. 3 strategic tips for this specific interview.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  strategy: { type: Type.STRING }
                }
              }
            },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}');
    } catch (e) {
      return { questions: [], tips: [] };
    }
  }
}
