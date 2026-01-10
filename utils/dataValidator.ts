
/**
 * VetaCV AI™ Data Validator
 * Detects placeholder patterns in generated content to ensure data completeness.
 */

export const validateCVData = (htmlContent: string): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];
  
  // Strip HTML tags to check text content efficiently
  const textContent = htmlContent.replace(/<[^>]*>/g, ' ');

  const placeholderPatterns = [
    { field: 'name', pattern: /\[Full Name\]|\[Name\]/i },
    { field: 'phone', pattern: /\[Phone.*\]|\[Mobile.*\]|\+263\s*000|0780000000/i },
    { field: 'email', pattern: /\[Email.*\]|@email\.com|example@/i },
    { field: 'location', pattern: /\[Location\]|\[City.*\]/i },
    { field: 'linkedin', pattern: /\[LinkedIn.*\]|linkedin\.com\/in\/\[username\]/i }
  ];

  placeholderPatterns.forEach(({ field, pattern }) => {
    if (pattern.test(textContent)) {
      missing.push(field);
    }
  });

  return {
    valid: missing.length === 0,
    missing
  };
};
