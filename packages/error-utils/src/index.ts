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
 *
 * This function is based on:
 * https://github.com/stdlib-js/assert-is-error
 */
export const isError = (error: unknown): error is Error => {
  if (!isObject(error)) return false;

  // Check for `Error` objects instantiated within the current global context.
  if (error instanceof Error) return true;

  // Walk the prototype tree until we find a matching object.
  while (error) {
    if (Object.prototype.toString.call(error) === '[object Error]') return true;
    error = Object.getPrototypeOf(error);
  }

  return false;
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
