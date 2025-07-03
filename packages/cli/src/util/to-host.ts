/**
 * Converts a valid deployment lookup parameter to a hostname.
 * `http://google.com` => google.com
 * google.com => google.com
 */
export default function toHost(url: string): string {
  // Check for common protocol typos and auto-correct them
  const correctedUrl = correctProtocolTypos(url);
  return correctedUrl.replace(/^(?:.*?\/\/)?([^/]+).*/, '$1');
}

/**
 * Detects and corrects common protocol typos
 */
function correctProtocolTypos(url: string): string {
  // Common typos: missing second slash in protocol
  if (url.match(/^https?:\/[^/]/)) {
    // https:/domain.com -> https://domain.com
    // http:/domain.com -> http://domain.com
    return url.replace(/^(https?):\/([^/])/, '$1://$2');
  }
  
  // Other common typos
  if (url.match(/^https?:\/\/\//)) {
    // https:///domain.com -> https://domain.com (extra slash)
    return url.replace(/^(https?):\/\/\//, '$1://');
  }
  
  return url;
}

/**
 * Validates if a URL has common protocol typos that we can detect
 * Returns an object with validation results and helpful error messages
 */
export function validateUrlProtocol(url: string): {
  isValid: boolean;
  correctedUrl?: string;
  error?: string;
  suggestion?: string;
} {
  // Check for common protocol typos
  if (url.match(/^https?:\/[^/]/)) {
    const corrected = url.replace(/^(https?):\/([^/])/, '$1://$2');
    return {
      isValid: false,
      correctedUrl: corrected,
      error: `Invalid protocol format in "${url}"`,
      suggestion: `Did you mean "${corrected}"? (Missing slash after protocol)`
    };
  }
  
  if (url.match(/^https?:\/\/\//)) {
    const corrected = url.replace(/^(https?):\/\/\//, '$1://');
    return {
      isValid: false,
      correctedUrl: corrected,
      error: `Invalid protocol format in "${url}"`,
      suggestion: `Did you mean "${corrected}"? (Extra slash in protocol)`
    };
  }
  
  // Check for other common protocol issues
  if (url.match(/^https?:[^/]/)) {
    const corrected = url.replace(/^(https?):([^/])/, '$1://$2');
    return {
      isValid: false,
      correctedUrl: corrected,
      error: `Invalid protocol format in "${url}"`,
      suggestion: `Did you mean "${corrected}"? (Missing slashes after protocol)`
    };
  }
  
  return { isValid: true };
}
