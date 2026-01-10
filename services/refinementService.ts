
/**
 * VetaCV AI™ Natural Language Refinement Service
 * Parses user commands and applies intelligent transformations to CVs
 */

import { GeminiService } from './geminiService';

export interface RefinementCommand {
  type: 'tone' | 'focus' | 'structure' | 'quantify' | 'format' | 'custom';
  parameters: {
    target?: string;
    value?: string;
    intensity?: number; // 1-5 scale
  };
  priority: 'high' | 'medium' | 'low';
}

export interface RefinementResult {
  digitalSummary: string;
  humanVersion: string;
  additionalFormats?: {
    interviewPoints: string[];
    linkedInPost: string;
    elevatorPitch: string;
    coverLetterBullets: string[];
  };
  changeLog: string[];
  suggestions: string[];
  metadata: {
    commandsApplied: RefinementCommand[];
    timeApplied: number;
    version: number;
  };
}

export class RefinementService {
  private geminiService: GeminiService;
  
  constructor() {
    this.geminiService = new GeminiService();
  }
  
  /**
   * MAIN REFINEMENT ENTRY POINT
   * Takes user's natural language request + current CV, returns enhanced CV
   */
  async refineCV(
    userRequest: string, 
    currentCV: { digitalSummary: string; humanVersion: string },
    userContext?: {
      targetRole?: string;
      targetIndustry?: string;
      experienceLevel?: string;
    }
  ): Promise<RefinementResult> {
    
    // STEP 1: Parse the user's intent
    const commands = this.parseUserIntent(userRequest, userContext);
    console.log('Parsed commands:', commands);
    
    // STEP 2: Build the refinement prompt based on commands
    const refinementPrompt = this.buildRefinementPrompt(
      commands, 
      currentCV, 
      userRequest,
      userContext
    );
    
    // STEP 3: Call Gemini with the prompt
    const geminiResponse = await this.geminiService.refineWithPrompt(refinementPrompt);
    
    // STEP 4: Parse and validate the response
    const result = this.parseAndValidateResponse(geminiResponse, commands);
    
    return result;
  }
  
  /**
   * NATURAL LANGUAGE PARSER
   * Converts "make it more aggressive for tech roles" into structured commands
   */
  private parseUserIntent(request: string, context?: any): RefinementCommand[] {
    const commands: RefinementCommand[] = [];
    const requestLower = request.toLowerCase();
    
    // PATTERN 1: Tone adjustments
    const tonePatterns = [
      { regex: /more aggressive|punchier|hard-hitting|bold/i, type: 'tone' as const, value: 'aggressive', intensity: 4 },
      { regex: /more professional|formal|corporate/i, type: 'tone' as const, value: 'professional', intensity: 3 },
      { regex: /more concise|shorter|brief|tighten/i, type: 'tone' as const, value: 'concise', intensity: 4 },
      { regex: /more technical|technical depth|add tech/i, type: 'tone' as const, value: 'technical', intensity: 4 },
      { regex: /more confident|assertive|authoritative/i, type: 'tone' as const, value: 'confident', intensity: 3 },
      { regex: /more friendly|approachable|warm/i, type: 'tone' as const, value: 'friendly', intensity: 2 },
    ];
    
    tonePatterns.forEach(pattern => {
      if (pattern.regex.test(requestLower)) {
        commands.push({
          type: 'tone',
          parameters: { value: pattern.value, intensity: pattern.intensity },
          priority: 'high'
        });
      }
    });
    
    // PATTERN 2: Content focus
    const focusPatterns = [
      { regex: /focus on (leadership|management)/i, type: 'focus' as const, target: 'leadership' },
      { regex: /emphasize (technical|tech skills)/i, type: 'focus' as const, target: 'technical' },
      { regex: /highlight (quantifiable|metrics|numbers|data)/i, type: 'focus' as const, target: 'quantification' },
      { regex: /show (projects|portfolio work)/i, type: 'focus' as const, target: 'projects' },
      { regex: /prioritize (soft skills|communication)/i, type: 'focus' as const, target: 'soft-skills' },
      { regex: /target (us|uk|european|global)/i, type: 'focus' as const, target: 'market-region' },
    ];
    
    focusPatterns.forEach(pattern => {
      const match = requestLower.match(pattern.regex);
      if (match) {
        commands.push({
          type: 'focus',
          parameters: { target: pattern.target, value: match[1] },
          priority: 'high'
        });
      }
    });
    
    // PATTERN 3: Structural changes
    const structurePatterns = [
      { regex: /add (.*?) section/i, type: 'structure' as const, action: 'add-section' },
      { regex: /remove (.*?) section/i, type: 'structure' as const, action: 'remove-section' },
      { regex: /reorder|rearrange/i, type: 'structure' as const, action: 'reorder' },
      { regex: /make it (\d+) pages?/i, type: 'structure' as const, action: 'page-limit' },
      { regex: /simplify|streamline/i, type: 'structure' as const, action: 'simplify' },
      { regex: /expand|elaborate|add detail/i, type: 'structure' as const, action: 'expand' },
    ];
    
    structurePatterns.forEach(pattern => {
      const match = requestLower.match(pattern.regex);
      if (match) {
        commands.push({
          type: 'structure',
          parameters: { 
            target: pattern.action === 'add-section' || pattern.action === 'remove-section' ? match[1] : undefined,
            value: pattern.action === 'page-limit' ? match[1] : pattern.action
          },
          priority: 'medium'
        });
      }
    });
    
    // PATTERN 4: Quantification requests
    if (requestLower.match(/add (more )?numbers|quantify|add metrics|add data/i)) {
      commands.push({
        type: 'quantify',
        parameters: { intensity: 5 },
        priority: 'high'
      });
    }
    
    // PATTERN 5: Format generation requests
    const formatPatterns = [
      { regex: /interview (points|prep|questions)/i, type: 'format' as const, format: 'interview-points' },
      { regex: /linkedin (post|update|article)/i, type: 'format' as const, format: 'linkedin-post' },
      { regex: /elevator (pitch|summary)/i, type: 'format' as const, format: 'elevator-pitch' },
      { regex: /cover letter (bullet|points)/i, type: 'format' as const, format: 'cover-letter-bullets' },
    ];
    
    formatPatterns.forEach(pattern => {
      if (pattern.regex.test(requestLower)) {
        commands.push({
          type: 'format',
          parameters: { value: pattern.format },
          priority: 'medium'
        });
      }
    });
    
    // PATTERN 6: Role/industry targeting
    if (requestLower.match(/for (tech|fintech|startup|corporate|consulting)/i)) {
      const match = requestLower.match(/for (tech|fintech|startup|corporate|consulting)/i);
      commands.push({
        type: 'focus',
        parameters: { target: 'industry', value: match![1] },
        priority: 'high'
      });
    }
    
    // PATTERN 7: If no commands detected, treat as custom
    if (commands.length === 0) {
      commands.push({
        type: 'custom',
        parameters: { value: request },
        priority: 'medium'
      });
    }
    
    // Apply context from user profile
    if (context?.targetRole) {
      commands.push({
        type: 'focus',
        parameters: { target: 'role', value: context.targetRole },
        priority: 'high'
      });
    }
    
    if (context?.targetIndustry) {
      commands.push({
        type: 'focus',
        parameters: { target: 'industry', value: context.targetIndustry },
        priority: 'high'
      });
    }
    
    return commands;
  }
  
  /**
   * BUILD THE REFINEMENT PROMPT
   * Creates a targeted prompt based on parsed commands
   */
  private buildRefinementPrompt(
    commands: RefinementCommand[],
    currentCV: { digitalSummary: string; humanVersion: string },
    originalRequest: string,
    context?: any
  ): string {
    
    let prompt = `You are VetaCV AI™ Refinement Engine. Your task: Transform the CV based on user commands.\n\n`;
    
    // Current CV context
    prompt += `CURRENT CV DIGITAL SUMMARY:\n${currentCV.digitalSummary}\n\n`;
    prompt += `CURRENT CV HTML (humanVersion):\n${currentCV.humanVersion.substring(0, 3000)}...\n\n`;
    
    // User request
    prompt += `USER'S ORIGINAL REQUEST: "${originalRequest}"\n\n`;
    
    // Parsed commands
    prompt += `PARSED COMMANDS TO APPLY:\n`;
    commands.forEach((cmd, i) => {
      prompt += `${i+1}. ${this.commandToInstruction(cmd)}\n`;
    });
    prompt += `\n`;
    
    // Context
    if (context?.targetRole || context?.targetIndustry) {
      prompt += `ADDITIONAL CONTEXT:\n`;
      if (context.targetRole) prompt += `- Target Role: ${context.targetRole}\n`;
      if (context.targetIndustry) prompt += `- Target Industry: ${context.targetIndustry}\n`;
      prompt += `\n`;
    }
    
    // Detailed instructions based on command types
    prompt += `APPLY THESE TRANSFORMATIONS:\n`;
    
    commands.forEach(cmd => {
      prompt += this.getCommandInstructions(cmd);
    });
    
    // Output format requirements
    prompt += `\nOUTPUT FORMAT (JSON ONLY):\n`;
    prompt += `{
  "digitalSummary": "Brief, energetic 1-2 sentence summary of changes made",
  "humanVersion": "Full updated HTML CV with ALL changes applied",
  "additionalFormats": {
    "interviewPoints": ["3-5 bullet points for interview preparation", "Focus on key achievements"],
    "linkedInPost": "A ready-to-post LinkedIn update about their career journey or new role",
    "elevatorPitch": "A 30-45 second verbal summary of their value proposition",
    "coverLetterBullets": ["3-5 bullet points for a cover letter", "Tailored to their target role"]
  },
  "changeLog": ["List each major change applied", "Be specific about what was modified"],
  "suggestions": ["2-3 suggestions for further improvement", "Be constructive and actionable"]
}\n\n`;
    
    // Quality requirements
    prompt += `QUALITY REQUIREMENTS:\n`;
    prompt += `1. NEVER use placeholders like [Phone Number] - use actual data or omit\n`;
    prompt += `2. Maintain consistency - don't change unrelated sections\n`;
    prompt += `3. Preserve all original information unless explicitly asked to remove\n`;
    prompt += `4. Use STAR format for achievements: Accomplished [X] as measured by [Y] by doing [Z]\n`;
    prompt += `5. Keep HTML clean and semantic - no markdown, proper closing tags\n`;
    
    return prompt;
  }
  
  /**
   * Helper: Convert command to human-readable instruction
   */
  private commandToInstruction(cmd: RefinementCommand): string {
    switch (cmd.type) {
      case 'tone':
        return `Change tone to ${cmd.parameters.value} (intensity: ${cmd.parameters.intensity}/5)`;
      case 'focus':
        return `Focus on ${cmd.parameters.target}: ${cmd.parameters.value}`;
      case 'structure':
        return `Structural change: ${cmd.parameters.value}${cmd.parameters.target ? ` - ${cmd.parameters.target}` : ''}`;
      case 'quantify':
        return `Add quantification and metrics to all achievements`;
      case 'format':
        return `Generate additional format: ${cmd.parameters.value}`;
      case 'custom':
        return `Custom request: ${cmd.parameters.value}`;
      default:
        return `Unknown command`;
    }
  }
  
  /**
   * Helper: Get detailed instructions for each command type
   */
  private getCommandInstructions(cmd: RefinementCommand): string {
    switch (cmd.type) {
      case 'tone':
        return this.getToneInstructions(cmd.parameters.value!, cmd.parameters.intensity!);
      case 'focus':
        return this.getFocusInstructions(cmd.parameters.target!, cmd.parameters.value!);
      case 'structure':
        return this.getStructureInstructions(cmd.parameters.value!, cmd.parameters.target);
      case 'quantify':
        return this.getQuantifyInstructions();
      case 'format':
        return this.getFormatInstructions(cmd.parameters.value!);
      default:
        return '';
    }
  }
  
  private getToneInstructions(tone: string, intensity: number): string {
    const instructions: Record<string, string> = {
      'aggressive': `Use action verbs: Engineered, Dominated, Architected, Spearheaded, Mastered.\nStart bullet points with strong verbs.\nRemove weak language like "Assisted with" or "Helped".\nQuantify everything possible.\nConfidence level: ${intensity}/5 - ${intensity >= 4 ? 'Very bold' : 'Moderately confident'}.`,
      'professional': `Use corporate language: Implemented, Managed, Coordinated, Developed, Oversaw.\nFocus on business impact and ROI.\nInclude industry-standard terminology.\nFormal sentence structure, no contractions.\nProfessionalism level: ${intensity}/5.`,
      'concise': `Cut all fluff words.\nMaximum 2 lines per bullet point.\nUse fragment sentences where appropriate.\nRemove redundant information.\nTarget 30% reduction in word count.`,
      'technical': `Add technical specifications: tools, languages, frameworks.\nInclude system architecture details.\nUse precise technical terminology.\nAdd a "Technical Skills" section if missing.\nDepth: ${intensity}/5.`,
      'confident': `Use "I" statements sparingly but powerfully.\nShow ownership of outcomes.\nAvoid passive voice.\nQuantify achievements assertively.`,
      'friendly': `Use collaborative language: Partnered, Collaborated, Supported.\nInclude team achievements.\nWarm, approachable tone.\nFocus on relationship building.`,
    };
    
    return `\nTONE ADJUSTMENT (${tone}):\n${instructions[tone] || 'Adjust tone as requested.'}\n`;
  }
  
  private getFocusInstructions(target: string, value: string): string {
    const instructions: Record<string, string> = {
      'leadership': `Emphasize management experience, team size, mentoring, strategy.\nAdd leadership-specific metrics (team growth, retention, satisfaction).\nHighlight decision-making authority and budget responsibility.`,
      'technical': `Expand technical skills section.\nAdd specific technologies, certifications, projects.\nUse technical jargon appropriate for the role.\nShow implementation details, not just management.`,
      'quantification': `Find and add metrics to EVERY achievement.\nIf no numbers exist, estimate reasonable metrics.\nUse %, $, #, time reductions.\nAdd before/after comparisons where possible.`,
      'projects': `Add a "Key Projects" or "Technical Projects" section.\nDescribe scope, technologies, outcomes.\nInclude personal/portfolio projects if relevant.`,
      'market-region': `Adapt language for ${value} market: ${value === 'us' ? 'Use US English, emphasize scalability, innovation, ROI' : value === 'uk' ? 'Use UK English, focus on compliance, governance, efficiency' : 'Use international standards, highlight cross-cultural experience'}.`,
      'industry': `Tailor for ${value} industry: ${this.getIndustryKeywords(value)}.\nUse industry-specific metrics and terminology.\nHighlight relevant transferable skills.`,
    };
    
    return `\nFOCUS ADJUSTMENT (${target}):\n${instructions[target] || `Focus on ${value} as requested.`}\n`;
  }
  
  private getIndustryKeywords(industry: string): string {
    const keywords: Record<string, string> = {
      'tech': 'scalability, agile, sprint, deployment, stack, architecture',
      'fintech': 'compliance, fintech, blockchain, crypto, risk management, regulation',
      'startup': 'MVP, lean, growth hacking, pivot, scalability, funding',
      'corporate': 'governance, compliance, stakeholder management, enterprise, scale',
      'consulting': 'client deliverables, stakeholder management, ROI, strategy, implementation',
    };
    
    return keywords[industry] || 'industry-specific terminology';
  }
  
  private getStructureInstructions(action: string, target?: string): string {
    switch (action) {
      case 'add-section':
        return `\nSTRUCTURE: Add "${target}" section\nCreate a new section titled "${target?.toUpperCase()}"\nPopulate with relevant content from their experience\nPlace it in logical flow of CV\n`;
      case 'remove-section':
        return `\nSTRUCTURE: Remove "${target}" section\nRemove the "${target}" section entirely\nDo not reference it elsewhere\nMaintain flow of remaining sections\n`;
      case 'reorder':
        return `\nSTRUCTURE: Reorder sections\nPrioritize most relevant sections first\nTypical order: Contact, Summary, Skills, Experience, Education, Other\nConsider target role when ordering\n`;
      case 'page-limit':
        return `\nSTRUCTURE: Limit to ${target} pages\nAdjust content density to fit ${target} pages\nRemove least relevant information\nCondense verbose sections\nMaintain readability\n`;
      case 'simplify':
        return `\nSTRUCTURE: Simplify\nRemove redundant information\nCombine similar bullet points\nUse clearer, simpler language\nFocus on core competencies\n`;
      case 'expand':
        return `\nSTRUCTURE: Expand\nAdd detail to each bullet point\nInclude more context and outcomes\nElaborate on responsibilities\nAdd more metrics and examples\n`;
      default:
        return '';
    }
  }
  
  private getQuantifyInstructions(): string {
    return `\nQUANTIFICATION: Add metrics to all achievements\nFor each bullet point, add at least one number:\n- Percentage: Increased by 40%\n- Dollar amount: Saved $50k\n- Time reduction: Reduced from 2 weeks to 3 days\n- Volume: Managed 250+ clients\nIf exact numbers unknown, use "approximately" or "over"\n`;
  }
  
  private getFormatInstructions(format: string): string {
    const instructions: Record<string, string> = {
      'interview-points': `Generate 3-5 bullet points for interview preparation.\nEach point should highlight a key achievement.\nInclude STAR format: Situation, Task, Action, Result.\nMake them conversational for verbal delivery.`,
      'linkedin-post': `Write a LinkedIn post about their career journey.\nShould be professional but personal.\nInclude relevant hashtags: #career #professiondevelopment.\nMention specific achievements from their CV.\nEnd with a call to action or reflection.`,
      'elevator-pitch': `Create a 30-45 second verbal summary.\nStart with "I help [target audience] achieve [outcome]."\nInclude 2-3 key achievements.\nEnd with what they're looking for next.\nKeep it conversational and confident.`,
      'cover-letter-bullets': `Generate 3-5 bullet points for a cover letter.\nTailor to their target role.\nShow how their skills solve employer problems.\nUse "I achieved X resulting in Y for Z company" format.`,
    };
    
    return `\nFORMAT GENERATION (${format}):\n${instructions[format] || `Generate ${format} content.`}\n`;
  }
  
  /**
   * PARSE AND VALIDATE GEMINI RESPONSE
   */
  private parseAndValidateResponse(
    response: string, 
    commands: RefinementCommand[]
  ): RefinementResult {
    try {
      // Extract JSON from response (handling markdown code blocks)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                       response.match(/({[\s\S]*})/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const result = JSON.parse(jsonStr) as RefinementResult;
      
      // Validate required fields
      if (!result.humanVersion || !result.digitalSummary) {
        throw new Error('Missing required fields in response');
      }
      
      // Ensure changeLog exists
      if (!result.changeLog) {
        result.changeLog = commands.map(cmd => `Applied: ${this.commandToInstruction(cmd)}`);
      }
      
      // Add metadata
      result.metadata = {
        commandsApplied: commands,
        timeApplied: Date.now(),
        version: 2
      };
      
      // Ensure suggestions exist
      if (!result.suggestions) {
        result.suggestions = [
          'Consider adding more quantifiable metrics to achievements',
          'Review the tone to match your target industry',
          'Update the skills section with latest technologies'
        ];
      }
      
      return result;
      
    } catch (error: any) {
      console.error('Failed to parse refinement response:', error);
      
      // Fallback result
      return {
        digitalSummary: 'Refinement failed - using original CV',
        humanVersion: '',
        changeLog: [`Error: ${error.message}`],
        suggestions: ['Please try a different refinement request'],
        metadata: {
          commandsApplied: commands,
          timeApplied: Date.now(),
          version: 1
        }
      };
    }
  }
  
  /**
   * QUICK REFINEMENT PRESETS
   */
  getQuickPresets(): Array<{
    id: string;
    label: string;
    description: string;
    command: string;
    icon: string;
  }> {
    return [
      {
        id: 'aggressive-tech',
        label: '⚡ Make Aggressive (Tech)',
        description: 'Bold, metric-driven language',
        command: 'Make it more aggressive for tech startup roles with strong metrics',
        icon: '⚡'
      },
      {
        id: 'quantify-all',
        label: '🔢 Add Quantification',
        description: 'Find and add numbers',
        command: 'Quantify all achievements with percentages, dollar amounts, and time savings',
        icon: '🔢'
      },
      {
        id: 'interview-prep',
        label: '💬 Interview Points',
        description: 'Generate talking points',
        command: 'Create 5 interview talking points using STAR format',
        icon: '💬'
      },
      {
        id: 'simplify',
        label: '✂️ Simplify & Tighten',
        description: 'Cut fluff, make concise',
        command: 'Make it more concise and remove any unnecessary information',
        icon: '✂️'
      }
    ];
  }
}
