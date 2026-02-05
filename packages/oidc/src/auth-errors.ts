/**
 * Error thrown when no authentication configuration is found.
 * This typically means the user needs to log in.
 */
export class NoAuthError extends Error {
  name = 'NoAuthError';
  constructor() {
    super('No authentication found. Please log in.');
  }
}

/**
 * Error thrown when the authentication token is expired
 * and no refresh token is available to obtain a new one.
 */
export class TokenExpiredError extends Error {
  name = 'TokenExpiredError';
  constructor() {
    super('Token expired and no refresh token available.');
  }
}

/**
 * Error thrown when attempting to refresh the authentication token fails.
 */
export class RefreshFailedError extends Error {
  name = 'RefreshFailedError';
  cause?: unknown;
  constructor(cause?: unknown) {
    super('Failed to refresh authentication token.');
    this.cause = cause;
  }
}
