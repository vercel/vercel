import { Response } from 'fetch-h2';
import { NowError } from './now-error';

/**
 * This error is thrown when there is an API error with a payload. The error
 * body includes the data that came in the payload plus status and a server
 * message. When it's a rate limit error in includes `retryAfter`
 */
export class APIError extends Error {
  status: number;
  serverMessage: string;
  retryAfter?: number;

  constructor(message: string, response: Response, body?: object) {
    super();
    this.message = `${message} (${response.status})`;
    this.status = response.status;
    this.serverMessage = message;

    if (body) {
      for (const field of Object.keys(body)) {
        if (field !== 'message') {
          // @ts-ignore
          this[field] = body[field];
        }
      }
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        this.retryAfter = parseInt(retryAfter, 10);
      }
    }
  }
}

/**
 * When you're passing two different options in the cli that exclude each
 * other, this error is thrown with the name of the conflicting property.
 */
export class ConflictingOption extends NowError<{ name: string }> {
  constructor(name: string) {
    super({
      code: 'conflicting_option',
      message: `You can't use at the same time a positive and negative value for option ${name}`,
      meta: { name }
    });
  }
}

/**
 * Thrown when a user is requested to the backend but we get unauthorized
 * because the token is not valid anymore.
 */
export class InvalidToken extends NowError<{}> {
  constructor() {
    super({
      code: `not_authorized`,
      message: `The specified token is not valid`,
      meta: {}
    });
  }
}

/**
 * Thrown when we request a user using a token but the user no longer exists,
 * usually because it was deleted at some point.
 */
export class MissingUser extends NowError<{}> {
  constructor() {
    super({
      code: `missing_user`,
      message: `Not able to load user, missing from response`,
      meta: {}
    });
  }
}
