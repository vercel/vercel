import util from 'node:util';

export interface SpawnError extends NodeJS.ErrnoException {
  spawnargs: string[];
}

/**
 * Security utility constants and functions to prevent prototype pollution vulnerabilities.
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

/**
 * A simple type guard for objects.
 *
 * @param obj - A possible object
 */
export const isObject = (obj: unknown): obj is Record<string, unknown> =>
  typeof obj === 'object' && obj !== null;

/**
 * A type guard for `try...catch` errors.
 * @deprecated use `require('node:util').types.isNativeError(error)` instead
 */
export const isError = (error: unknown): error is Error => {
  return util.types.isNativeError(error);
};

export const isErrnoException = (
  error: unknown
): error is NodeJS.ErrnoException => {
  return isError(error) && 'code' in error;
};

interface ErrorLike {
  message: string;
  name?: string;
  stack?: string;
}

/**
 * A type guard for error-like objects.
 */
export const isErrorLike = (error: unknown): error is ErrorLike =>
  isObject(error) && 'message' in error;

/**
 * Parses errors to string, useful for getting the error message in a
 * `try...catch` statement.
 */
export const errorToString = (error: unknown, fallback?: string): string => {
  if (isError(error) || isErrorLike(error)) return error.message;

  if (typeof error === 'string') return error;

  return fallback ?? 'An unknown error has ocurred.';
};

/**
 * Normalizes unknown errors to the Error type, useful for working with errors
 * in a `try...catch` statement.
 */
export const normalizeError = (error: unknown): Error => {
  if (isError(error)) return error;

  const errorMessage = errorToString(error);

  // Copy over additional properties if the object is error-like.
  return isErrorLike(error)
    ? Object.assign(new Error(errorMessage), error)
    : new Error(errorMessage);
};

export function isSpawnError(v: unknown): v is SpawnError {
  return isErrnoException(v) && 'spawnargs' in v;
}
