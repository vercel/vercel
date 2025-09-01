/**
 * Security utility for validating zip entry paths to prevent path traversal attacks.
 * 
 * This module provides protection against the JSZip path traversal vulnerability
 * where malicious zip files can contain entries that use path traversal sequences
 * (like ../../../) to write files outside the intended extraction directory.
 * 
 * References:
 * - JSZip loadAsync path traversal vulnerability
 * - OWASP Path Traversal prevention guidelines
 */

import * as path from 'path';

/**
 * Validates that a zip entry path is safe and doesn't contain path traversal attempts.
 * 
 * @param entryPath - The file path from a zip entry
 * @param allowedBasePath - The base directory where extraction should be confined
 * @returns true if the path is safe, false if it contains traversal attempts
 */
export function isZipEntryPathSafe(entryPath: string, allowedBasePath: string): boolean {
  // Normalize the paths to handle different path separators and resolve .. sequences
  const normalizedEntry = path.normalize(entryPath);
  const normalizedBase = path.normalize(allowedBasePath);
  
  // Check for null bytes which can be used to bypass security checks
  if (normalizedEntry.includes('\0') || normalizedBase.includes('\0')) {
    return false;
  }
  
  // Check for absolute paths which should not be allowed in zip entries
  if (path.isAbsolute(normalizedEntry)) {
    return false;
  }
  
  // Additional check for Windows-style absolute paths that might not be caught by path.isAbsolute on Unix
  if (/^[a-zA-Z]:[\/\\]/.test(normalizedEntry)) {
    return false;
  }
  
  // Resolve the final destination path
  const destinationPath = path.resolve(normalizedBase, normalizedEntry);
  const resolvedBasePath = path.resolve(normalizedBase);
  
  // Ensure the destination is within the allowed base directory
  const relativePath = path.relative(resolvedBasePath, destinationPath);
  
  // Check if the relative path goes outside the base directory
  if (relativePath.startsWith('..') || relativePath.includes(`..${path.sep}`)) {
    return false;
  }
  
  // Additional security: check for Windows-style path traversal even on Unix systems
  // This prevents attacks that rely on cross-platform path interpretation differences
  if (normalizedEntry.includes('\\..\\') || normalizedEntry.includes('\\..') || normalizedEntry.includes('..\\')) {
    return false;
  }
  
  return true;
}

/**
 * Validates and resolves a zip entry path, throwing an error if unsafe.
 * 
 * @param entryPath - The file path from a zip entry
 * @param allowedBasePath - The base directory where extraction should be confined
 * @returns The resolved safe path
 * @throws Error if the path is unsafe
 */
export function validateAndResolveZipEntryPath(entryPath: string, allowedBasePath: string): string {
  if (!isZipEntryPathSafe(entryPath, allowedBasePath)) {
    throw new Error(
      `Unsafe zip entry path detected: "${entryPath}". Path traversal attempt blocked for security.`
    );
  }
  
  return path.resolve(allowedBasePath, entryPath);
}

/**
 * JSZip-specific protection for loadAsync operations.
 * This function can be used to validate all entries before extraction.
 * 
 * @param zipEntries - Object with zip entry names as keys
 * @param allowedBasePath - The base directory where extraction should be confined
 * @throws Error if any entry contains unsafe paths
 */
export function validateJSZipEntries(zipEntries: Record<string, any>, allowedBasePath: string): void {
  for (const entryPath of Object.keys(zipEntries)) {
    if (!isZipEntryPathSafe(entryPath, allowedBasePath)) {
      throw new Error(
        `JSZip loadAsync security violation: Entry "${entryPath}" contains path traversal sequences. Extraction blocked.`
      );
    }
  }
}

/**
 * Common patterns that indicate path traversal attempts in zip entries.
 * These can be used for additional validation or logging.
 */
export const SUSPICIOUS_PATH_PATTERNS = [
  /\.\.\//,           // Unix-style parent directory
  /\.\.\\/, 	      // Windows-style parent directory
  /\0/,               // Null byte injection
  /^[\/\\]/,          // Absolute path indicators
  /^[a-zA-Z]:[\/\\]/, // Windows-style absolute paths (C:\, D:\, etc.)
  /[\/\\]\.\.[\/\\]/, // Parent directory in middle of path
  /\\\.\.[\\\/]?/,    // Windows-style traversal patterns (covers \.. and \..\)
] as const;

/**
 * Checks if a path contains any suspicious patterns.
 * 
 * @param entryPath - The path to check
 * @returns true if suspicious patterns are found
 */
export function containsSuspiciousPatterns(entryPath: string): boolean {
  return SUSPICIOUS_PATH_PATTERNS.some(pattern => pattern.test(entryPath));
}