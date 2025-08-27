/**
 * Cookie validation utilities according to RFC 6265
 * 
 * This module provides validation functions for cookie names, values, paths, and domains
 * to prevent security vulnerabilities and ensure compliance with HTTP cookie standards.
 */

/**
 * Validates a cookie name according to RFC 6265
 * Cookie names must not contain control characters, separators, or special characters
 */
export function isValidCookieName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  // RFC 6265: cookie-name = token
  // token = 1*<any CHAR except CTLs or separators>
  // separators = "(" | ")" | "<" | ">" | "@" | "," | ";" | ":" | "\" | <"> | "/" | "[" | "]" | "?" | "=" | "{" | "}" | SP | HT
  // CTLs = <any US-ASCII control character (octets 0 - 31) and DEL (127)>
  
  // Check for control characters (0-31, 127)
  for (let i = 0; i < name.length; i++) {
    const charCode = name.charCodeAt(i);
    if (charCode <= 31 || charCode === 127) {
      return false;
    }
  }
  
  // Check for separator characters
  const separators = '()<>@,;:\\"/?={}[]';
  for (const char of separators) {
    if (name.includes(char)) {
      return false;
    }
  }
  
  // Check for space and tab
  if (name.includes(' ') || name.includes('\t')) {
    return false;
  }
  
  return true;
}

/**
 * Validates a cookie value according to RFC 6265
 * Cookie values have specific character restrictions
 */
export function isValidCookieValue(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  
  // Empty values are allowed
  if (value === '') {
    return true;
  }
  
  // RFC 6265: cookie-value = *cookie-octet / ( DQUOTE *cookie-octet DQUOTE )
  // cookie-octet = %x21 / %x23-2B / %x2D-3A / %x3C-5B / %x5D-7E
  // Essentially: any ASCII character except control chars, whitespace, double quote, comma, semicolon, and backslash
  
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    
    // Control characters (0-31, 127) are not allowed
    if (charCode <= 31 || charCode === 127) {
      return false;
    }
    
    // Specific characters that are not allowed: " , ; \
    if (charCode === 34 || charCode === 44 || charCode === 59 || charCode === 92) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validates a cookie path according to RFC 6265
 */
export function isValidCookiePath(path: string): boolean {
  if (typeof path !== 'string') {
    return false;
  }
  
  // Empty path defaults to request path, which is valid
  if (path === '') {
    return true;
  }
  
  // Path must start with '/'
  if (!path.startsWith('/')) {
    return false;
  }
  
  // Check for control characters
  for (let i = 0; i < path.length; i++) {
    const charCode = path.charCodeAt(i);
    if (charCode <= 31 || charCode === 127) {
      return false;
    }
  }
  
  // Path should not contain semicolon as it's used as cookie delimiter
  if (path.includes(';')) {
    return false;
  }
  
  return true;
}

/**
 * Validates a cookie domain according to RFC 6265
 */
export function isValidCookieDomain(domain: string): boolean {
  if (typeof domain !== 'string') {
    return false;
  }
  
  // Empty domain uses request host, which is valid
  if (domain === '') {
    return true;
  }
  
  // Domain can start with a dot (for subdomain matching)
  const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain;
  
  // Basic domain name validation
  // Must contain only letters, numbers, dots, and hyphens
  if (!/^[a-zA-Z0-9.-]+$/.test(normalizedDomain)) {
    return false;
  }
  
  // Must not start or end with hyphen or dot
  if (normalizedDomain.startsWith('-') || normalizedDomain.endsWith('-') ||
      normalizedDomain.startsWith('.') || normalizedDomain.endsWith('.')) {
    return false;
  }
  
  // Must not contain consecutive dots
  if (normalizedDomain.includes('..')) {
    return false;
  }
  
  // Must contain at least one dot (except for localhost and similar)
  const parts = normalizedDomain.split('.');
  if (parts.length < 2 && !['localhost'].includes(normalizedDomain.toLowerCase())) {
    return false;
  }
  
  // Each part must not be empty and must not start with hyphen
  for (const part of parts) {
    if (!part || part.startsWith('-') || part.endsWith('-')) {
      return false;
    }
  }
  
  return true;
}

/**
 * Sanitizes a cookie name by removing invalid characters
 * This is a fallback for cases where we want to be permissive
 */
export function sanitizeCookieName(name: string): string {
  if (typeof name !== 'string') {
    return '';
  }
  
  // Keep only valid characters: letters, numbers, underscore, hyphen
  return name.replace(/[^a-zA-Z0-9_-]/g, '');
}