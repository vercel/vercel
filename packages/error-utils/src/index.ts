import util from 'node:util';

export interface SpawnError extends NodeJS.ErrnoException {
  spawnargs: string[];
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

type UtilWithSystemErrorMessage = typeof util & {
  getSystemErrorMessage?: (errno: number) => string;
};

const nativeGetSystemErrorMessage = (util as UtilWithSystemErrorMessage)
  .getSystemErrorMessage;

const getSystemErrorMessageFallback = (errno: number): string => {
  return (
    util.getSystemErrorMap().get(errno)?.[1] ?? `Unknown system error ${errno}`
  );
};

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

export const getSystemErrorMessage =
  nativeGetSystemErrorMessage ?? getSystemErrorMessageFallback;

export const errorToStringFriendly = (
  error: unknown,
  fallback?: string
): string => {
  if (isErrnoException(error) && typeof error.errno === 'number') {
    return getSystemErrorMessage(error.errno);
  }

  return errorToString(error, fallback);
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
