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

/**
 * Safely filters object entries to exclude dangerous keys that could lead to prototype pollution.
 */
export function getSafeEntries<T>(obj: Record<string, T>): [string, T][] {
  return Object.entries(obj).filter(([key]) => isSafeKey(key));
}

/**
 * Safely assigns properties to an object, skipping dangerous keys.
 */
export function safeAssign<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const [key, value] of Object.entries(source)) {
    if (isSafeKey(key)) {
      target[key] = value;
    }
  }
}