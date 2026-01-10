
/**
 * VetaCV AI™ Data Injector
 * Replaces placeholders in the HTML with actual user data.
 */

export interface ContactData {
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  linkedin?: string;
}

export const injectContactData = (html: string, data: ContactData): string => {
  let injected = html;
  
  // Specific replacements for known placeholders
  const replacements = [
    { pattern: /\[Full Name\]|\[Name\]/gi, value: data.name },
    { pattern: /\[Phone Number\]|\[Phone\]|\[Mobile Number\]/gi, value: data.phone },
    { pattern: /\[Email Address\]|\[Email\]/gi, value: data.email },
    { pattern: /\[Location\]|\[City, Country\]|\[City\]/gi, value: data.location },
    { pattern: /\[LinkedIn Profile\]|\[LinkedIn.*\]/gi, value: data.linkedin }
  ];
  
  replacements.forEach(({ pattern, value }) => {
    if (value && value.trim() !== '') {
      injected = injected.replace(pattern, value);
    }
  });

  // Cleanup Logic:
  // 1. Remove placeholders that weren't replaced (user didn't provide data)
  //    Matches "[Something] | " or " | [Something]"
  injected = injected.replace(/\[[^\]]+\]\s*\|\s*/g, '');
  injected = injected.replace(/\s*\|\s*\[[^\]]+\]/g, '');
  
  // 2. Remove any remaining isolated placeholders like [Phone Number]
  injected = injected.replace(/\[(Phone|Email|Location|LinkedIn)[^\]]*\]/gi, '');

  // 3. Clean up double pipes or trailing/leading pipes left over from removal
  injected = injected.replace(/\|\s*\|/g, '|'); // Double pipes
  injected = injected.replace(/^\s*\|\s*/gm, ''); // Leading pipe on a line
  injected = injected.replace(/\s*\|\s*$/gm, ''); // Trailing pipe on a line

  return injected;
};
