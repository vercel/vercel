/**
 * Error thrown when no authentication configuration is found.
 * This typically means the user needs to log in.
 */
export class AccessTokenMissingError extends Error {
  name = 'AccessTokenMissingError';
  constructor() {
    super(
      'No authentication found. Please log in with the Vercel CLI (vercel login).'
    );
  }
}

/**
 * Error thrown when attempting to refresh the authentication token fails.
 * This includes cases where no refresh token is available.
 */
export class RefreshAccessTokenFailedError extends Error {
  name = 'RefreshAccessTokenFailedError';
  constructor(cause?: unknown) {
    // @ts-expect-error - typescript is outdated, this is the spec-compliant way.
    super('Failed to refresh authentication token.', { cause });
  }
}
