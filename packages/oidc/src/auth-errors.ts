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
 * Error thrown when attempting to refresh the authentication token fails.
 * This includes cases where no refresh token is available.
 */
export class RefreshFailedError extends Error {
  name = 'RefreshFailedError';
  cause?: unknown;
  constructor(cause?: unknown) {
    super('Failed to refresh authentication token.');
    this.cause = cause;
  }
}
