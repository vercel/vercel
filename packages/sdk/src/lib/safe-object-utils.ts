/**
 * Security utility functions to prevent prototype pollution vulnerabilities.
 */

const dangerousKeys = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

/**
 * Checks if a key is safe to use for object property assignment.
 * Prevents prototype pollution by filtering out dangerous keys.
 */
export function isSafeKey(key: string): boolean {
  return !dangerousKeys.has(key);
}