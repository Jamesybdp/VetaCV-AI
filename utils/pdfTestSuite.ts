
import { sanitizeHtmlForPdf } from './htmlSanitizer';

export const runPDFTestSuite = async () => {
  console.group('🧪 VetaCV AI PDF Test Suite');
  
  // TEST 1: Nathaniel's Concatenation Bug
  const nathanielBug = `# Nathaniel MagayaHarare, Zimbabwe | ACCA Advanced Diploma | Junior Accountant & Financial Analyst##PROFESSIONAL PROFILEResults-driven ACCA professional...`;
  
  console.log('Test 1: Nathaniel Concatenation Bug');
  const result1 = sanitizeHtmlForPdf(nathanielBug);
  const test1Passed = !result1.html.includes('Analyst##PROFESSIONAL') && 
                      result1.html.includes('</h1>') && 
                      result1.html.includes('<h2>PROFESSIONAL');
  
  if (test1Passed) {
    console.log('✅ Test 1 Passed:', result1.fixesApplied, 'fixes applied');
  } else {
    console.error('❌ Test 1 FAILED: Concatenation or Heading Structure issue');
  }
  
  // TEST 2: Victoria's Cut-off Sentence
  const victoriaHTML = `<h2>PROFESSIONAL EXPERIENCE</h2>
    <h3>Distance Dynamics Call Centre | Call Centre Agent</h3>
    <p><em>September 2025 – November 2025</em></p>
    <ul>
      <li><strong>Dominated Service Metrics:</strong> Maintained a 90%+ CSAT and first-call resolution rate in a high-pressure environment.</li>
      <li><strong>Workflow Optimization:</strong> Identified inefficiencies in call flows, reducing Average Handling Time (AHT) by 15% through Salesforce</li>
    </ul>`;
  
  console.log('Test 2: Victoria\'s Cut-off Sentence');
  const result2 = sanitizeHtmlForPdf(victoriaHTML);
  const test2Passed = result2.html.includes('</li>') && result2.html.includes('</ul>');
  
  if (test2Passed) {
    console.log('✅ Test 2 Passed:', result2.warnings.length, 'warnings');
  } else {
    console.error('❌ Test 2 FAILED: List structure broken');
  }
  
  // TEST 3: Garbled Text Detection
  const garbledText = `inancial Operations Specialist\nA Advanced Diploma and a specialty in cloud-accounting workflows.`;
  
  console.log('Test 3: Garbled Text Detection');
  const result3 = sanitizeHtmlForPdf(garbledText);
  const recovered = result3.html.includes('Financial');
  console.log('Garbled input detected & recovered:', recovered ? 'Yes' : 'No');
  
  console.groupEnd();
  return { test1: result1, test2: result2, test3: result3 };
};
