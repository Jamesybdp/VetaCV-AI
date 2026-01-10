
/**
 * VetaCV AI™ HTML Sanitizer for Perfect PDF Output
 * Fixes all edge cases: concatenation, missing tags, spacing, and structure
 */

export interface SanitizationResult {
  html: string;
  warnings: string[];
  fixesApplied: number;
}

/**
 * MAIN SANITIZATION FUNCTION
 * Transforms any AI-generated HTML into PDF-perfect structure
 */
export const sanitizeHtmlForPdf = (rawHtml: string): SanitizationResult => {
  const warnings: string[] = [];
  let fixesApplied = 0;
  let html = rawHtml;

  // --- PHASE 1: Detect Critical Issues ---
  if (!html || html.trim().length < 50) {
    warnings.push('HTML content is too short or empty');
  }

  // Detect concatenation patterns like "Financial Analyst##PROFESSIONAL"
  const concatRegex = /([a-zA-Z0-9\s&])(#{2,})([A-Z][a-zA-Z\s]+)/g;
  const concatMatches = [...html.matchAll(concatRegex)];
  if (concatMatches.length > 0) {
    warnings.push(`Found ${concatMatches.length} concatenated headings`);
  }

  // --- PHASE 2: Structural Repairs ---
  
  // FIX 1: Repair concatenated headings (Nathaniel's issue)
  html = html.replace(
    /([a-zA-Z0-9\s&]+)(#{2,})([A-Z][a-zA-Z\s]+)/g,
    (match, before, hashes, after) => {
      fixesApplied++;
      return `${before}</h2>\n<h2>${after}`;
    }
  );

  // FIX 2: Ensure proper heading hierarchy and closing
  const headingFixChain: [RegExp, string][] = [
    // Fix h1 without closing
    [/<h1>([^<]+)<h2>/g, '<h1>$1</h1>\n<h2>'],
    [/<h1>([^<]+)<p>/g, '<h1>$1</h1>\n<p>'],
    // Fix h2 without closing
    [/<h2>([^<]+)<h3>/g, '<h2>$1</h2>\n<h3>'],
    [/<h2>([^<]+)<p>/g, '<h2>$1</h2>\n<p>'],
    [/<h2>([^<]+)<ul>/g, '<h2>$1</h2>\n<ul>'],
    // Fix h3 without closing
    [/<h3>([^<]+)<p>/g, '<h3>$1</h3>\n<p>'],
  ];

  headingFixChain.forEach(([regex, replacement]) => {
    const matches = html.match(regex);
    if (matches) {
      fixesApplied += matches.length;
      html = html.replace(regex, replacement);
    }
  });

  // FIX 3: Ensure list items are properly wrapped
  html = html.replace(
    /<li>([^<]{50,})<li>/g,
    '<li>$1</li>\n<li>'
  );

  // FIX 4: Add missing closing tags for lists
  if ((html.match(/<ul>/g) || []).length > (html.match(/<\/ul>/g) || []).length) {
    html += '</ul>';
    fixesApplied++;
    warnings.push('Added missing </ul> tag');
  }

  if ((html.match(/<ol>/g) || []).length > (html.match(/<\/ol>/g) || []).length) {
    html += '</ol>';
    fixesApplied++;
    warnings.push('Added missing </ol> tag');
  }

  // FIX 5: Normalize whitespace but preserve intentional spacing
  html = html
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/\s+</g, '<') // Remove spaces before tags
    .replace(/>\s+/g, '>') // Remove spaces after tags
    .replace(/<\/h[1-6]>\s*<h[1-6]>/g, '</h1>\n<h2>'); // Ensure breaks between headings

  // FIX 6: Convert markdown headers to HTML if they slipped through
  html = html
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

  // --- PHASE 4: Recovery from Catastrophic Corruption (Garbled Text) ---
  const recoverFromGarbledText = (text: string): string => {
    const commonCorrections: [RegExp, string][] = [
      [/\binancial\b/gi, 'Financial'],
      [/\bperations\b/gi, 'Operations'],
      [/\bccounting\b/gi, 'Accounting'],
      [/\bdvanced\b/gi, 'Advanced'],
      [/\biploma\b/gi, 'Diploma'],
      [/\bmpecialist\b/gi, 'Specialist'],
      [/\boud\b/gi, 'Cloud'],
      [/\borkflows\b/gi, 'Workflows'],
      [/\bnalyst\b/gi, 'Analyst'],
    ];
    
    let recovered = text;
    commonCorrections.forEach(([pattern, replacement]) => {
      recovered = recovered.replace(pattern, replacement);
    });
    
    return recovered;
  };

  // Apply recovery if we detect words that look like they lost their first letter
  if (html.match(/\b[a-z]inancial\b/i) || html.match(/\b[a-z]ccounting\b/i)) {
    warnings.push('Garbled text detected - applying text recovery');
    html = recoverFromGarbledText(html);
    fixesApplied++;
  }

  // --- PHASE 5: Ensure Minimum Viable Structure ---
  const hasStructure = html.includes('<h') || html.includes('<p');
  if (!hasStructure && html.length > 100) {
    warnings.push('Adding minimal HTML structure');
    
    // Convert to paragraphs if it's just text
    const lines = html.split('\n').filter(l => l.trim().length > 10);
    html = lines.map(line => `<p>${line.trim()}</p>`).join('\n');
    fixesApplied++;
  }

  // --- PHASE 6: Wrap in PDF-optimized container ---
  const wrappedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* PDF-OPTIMIZED STYLES */
    #veta-pdf-container {
      font-family: 'Georgia', 'Times New Roman', serif;
      line-height: 1.5;
      font-size: 11pt;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
      box-sizing: border-box;
    }
    
    h1 {
      font-size: 18pt;
      margin-top: 0;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #eee;
    }
    
    h2 {
      font-size: 14pt;
      margin-top: 25px;
      margin-bottom: 10px;
      color: #2c3e50;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
    }
    
    h3 {
      font-size: 12pt;
      margin-top: 20px;
      margin-bottom: 8px;
      color: #34495e;
      font-weight: bold;
    }
    
    p {
      margin-top: 8px;
      margin-bottom: 12px;
      text-align: justify;
    }
    
    ul, ol {
      margin-top: 10px;
      margin-bottom: 15px;
      padding-left: 25px;
    }
    
    li {
      margin-bottom: 6px;
      page-break-inside: avoid;
    }
    
    /* Page break control */
    .page-break {
      page-break-before: always;
    }
    
    @media print {
      body { margin: 0; padding: 0; }
      #veta-pdf-container { padding: 15mm; }
      
      /* Prevent breaking inside key elements */
      h1, h2, h3, h4 { page-break-after: avoid; }
      ul, ol, p, li { page-break-inside: avoid; }
      
      /* Force footer to bottom */
      .veta-footer {
        position: fixed;
        bottom: 10mm;
        left: 0;
        right: 0;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div id="veta-pdf-container">
    ${html}
  </div>
</body>
</html>`;

  return {
    html: wrappedHtml,
    warnings,
    fixesApplied
  };
};

/**
 * DEBUG FUNCTION: Show what we're fixing
 */
export const debugHtmlStructure = (rawHtml: string): void => {
  console.group('🔍 HTML DEBUG ANALYSIS');
  console.log('Raw length:', rawHtml.length);
  console.log('First 500 chars:', rawHtml.substring(0, 500));
  
  // Check for concatenation
  const concatMatches = rawHtml.match(/([a-z0-9\s])(#{2,})([A-Z])/g);
  if (concatMatches) {
    console.warn('Found concatenated sections:', concatMatches);
  }
  
  // Check tag balance
  const openTags = (rawHtml.match(/<h[1-6]>/g) || []).length;
  const closeTags = (rawHtml.match(/<\/h[1-6]>/g) || []).length;
  if (openTags !== closeTags) {
    console.warn(`Tag imbalance: ${openTags} opening vs ${closeTags} closing headings`);
  }
  
  console.groupEnd();
};
