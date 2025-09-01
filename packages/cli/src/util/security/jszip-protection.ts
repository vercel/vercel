/**
 * JSZip loadAsync protection wrapper to prevent path traversal vulnerabilities.
 * 
 * This module provides secure wrappers around JSZip operations to ensure that
 * any usage of JSZip in the codebase is protected against path traversal attacks.
 * 
 * Usage:
 * ```typescript
 * import { secureLoadAsync } from './jszip-protection';
 * 
 * const zip = await secureLoadAsync(buffer, extractionPath);
 * // zip object is now safe to use for extraction
 * ```
 */

import { validateJSZipEntries, isZipEntryPathSafe } from './zip-path-validator';

/**
 * Type definition for JSZip-like objects.
 * This avoids the need to import JSZip directly while still providing type safety.
 */
export interface JSZipLike {
  files: Record<string, any>;
  loadAsync(data: any, options?: any): Promise<JSZipLike>;
  forEach(callback: (relativePath: string, file: any) => void): void;
  file(path: string): any;
  folder(name: string): JSZipLike | null;
}

/**
 * Secure wrapper for JSZip.loadAsync that validates all entry paths before allowing extraction.
 * 
 * @param JSZip - The JSZip constructor/class
 * @param data - The zip data to load (Buffer, Uint8Array, string, etc.)
 * @param extractionPath - The base path where files will be extracted
 * @param options - Optional JSZip loadAsync options
 * @returns Promise<JSZipLike> - The loaded zip object, validated for security
 */
export async function secureLoadAsync(
  JSZip: any,
  data: any,
  extractionPath: string,
  options?: any
): Promise<JSZipLike> {
  
  const zip = await JSZip.loadAsync(data, options);
  
  // Validate all entries in the zip file
  validateJSZipEntries(zip.files, extractionPath);
  
  return zip;
}

/**
 * Creates a secure JSZip wrapper that automatically validates paths.
 * 
 * @param JSZip - The JSZip constructor/class
 * @param extractionPath - The base path where files will be extracted
 * @returns A wrapped JSZip class with secure loadAsync
 */
export function createSecureJSZip(JSZip: any, extractionPath: string) {
  return {
    loadAsync: async (data: any, options?: any) => {
      return secureLoadAsync(JSZip, data, extractionPath, options);
    }
  };
}

/**
 * Validates a JSZip object after it has been loaded to ensure no malicious paths.
 * This can be used as an additional safety check.
 * 
 * @param zip - The loaded JSZip object
 * @param extractionPath - The base path where files will be extracted
 * @throws Error if any malicious paths are found
 */
export function validateLoadedJSZip(zip: JSZipLike, extractionPath: string): void {
  validateJSZipEntries(zip.files, extractionPath);
}

/**
 * Secure file extraction from JSZip with path validation.
 * 
 * @param zip - The JSZip object
 * @param entryPath - The path of the file to extract
 * @param extractionPath - The base extraction directory
 * @returns The file object if safe, throws error if unsafe
 */
export function secureGetFile(zip: JSZipLike, entryPath: string, extractionPath: string) {
  if (!isZipEntryPathSafe(entryPath, extractionPath)) {
    throw new Error(
      `JSZip security violation: Attempt to access unsafe path "${entryPath}". Path traversal blocked.`
    );
  }
  
  return zip.file(entryPath);
}

/**
 * Secure iteration over JSZip files with path validation.
 * 
 * @param zip - The JSZip object
 * @param extractionPath - The base extraction directory
 * @param callback - Function to call for each safe file
 */
export function secureForEach(
  zip: JSZipLike,
  extractionPath: string,
  callback: (relativePath: string, file: any) => void
): void {
  zip.forEach((relativePath, file) => {
    if (!isZipEntryPathSafe(relativePath, extractionPath)) {
      throw new Error(
        `JSZip security violation: Unsafe path "${relativePath}" found during iteration. Path traversal blocked.`
      );
    }
    callback(relativePath, file);
  });
}

/**
 * Example usage and best practices for secure JSZip handling.
 */
export const JSZIP_SECURITY_EXAMPLES = {
  // Secure loadAsync usage
  secureLoad: `
    import JSZip from 'jszip';
    import { secureLoadAsync } from './jszip-protection';
    
    const zip = await secureLoadAsync(JSZip, buffer, '/safe/extraction/path');
    // Now safe to use zip object
  `,
  
  // Secure iteration
  secureIteration: `
    import { secureForEach } from './jszip-protection';
    
    secureForEach(zip, extractionPath, (relativePath, file) => {
      // This callback only receives safe paths
      console.log('Safe file:', relativePath);
    });
  `,
  
  // Manual validation
  manualValidation: `
    import { validateLoadedJSZip } from './jszip-protection';
    
    const zip = await JSZip.loadAsync(buffer);
    validateLoadedJSZip(zip, extractionPath); // Throws if unsafe
  `
};

/**
 * Common JSZip security anti-patterns to avoid.
 */
export const JSZIP_SECURITY_ANTIPATTERNS = [
  'Direct JSZip.loadAsync() without path validation',
  'Extracting files without checking entry.name for path traversal',
  'Using zip.file() with user-controlled paths',
  'Iterating over zip.files without validating paths',
  'Trusting zip entry names as safe file paths'
] as const;