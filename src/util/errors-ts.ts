import { Response } from 'fetch-h2';
import { NowError } from './now-error';
import param from './output/param';

/**
 * This error is thrown when there is an API error with a payload. The error
 * body includes the data that came in the payload plus status and a server
 * message. When it's a rate limit error in includes `retryAfter`
 */
export class APIError extends Error {
  status: number;
  serverMessage: string;
  retryAfter: number | null | 'never';
  [key: string]: any;

  constructor(message: string, response: Response, body?: object) {
    super();
    this.message = `${message} (${response.status})`;
    this.status = response.status;
    this.serverMessage = message;
    this.retryAfter = null;

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
 * When you're fetching information for the current team but the client can't
 * retrieve information. This means that the team was probably deleted or the
 * member removed.
 */
export class TeamDeleted extends NowError<{}> {
  constructor() {
    super({
      code: 'team_deleted',
      message: `Your team was deleted. You can switch to a different one using ${param(
        'now switch'
      )}.`,
      meta: {}
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
 * Thrown when the user tries to add a domain forcing the CDN enabled but he's
 * on the OSS plan and we don't allow it.
 */
export class CDNNeedsUpgrade extends NowError<{}> {
  constructor() {
    super({
      code: 'CDN_NEEDS_UPGRADE',
      meta: {},
      message: `You can't add domains with CDN enabled from an OSS plan.`
    });
  }
}

/**
 * Thrown when a user tries to add a domain that exists already for a different
 * user under a different context.
 */
export class DomainAlreadyExists extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_ALREADY_EXISTS',
      meta: { domain },
      message: `The domain ${domain} already exists under a different context.`
    });
  }
}

/**
 * When information about a domain is requested but the current user / team has no
 * permissions to get that information.
 */
export class DomainPermissionDenied extends NowError<{ domain: string, context: string }> {
  constructor(domain: string, context: string) {
    super({
      code: 'DOMAIN_PERMISSION_DENIED',
      meta: { domain, context },
      message: `You don't have access to the domain ${domain} under ${context}.`
    });
  }
}

/**
 * When information about a domain is requested but the domain doesn't exist
 */
export class DomainNotFound extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_FOUND',
      meta: { domain },
      message: `The domain ${domain} can't be found.`
    });
  }
}

/**
 * This error is returned when we perform a verification against the server and it
 * fails for both methods. It includes in the payload the domain name and metadata
 * to tell the reason why the verification failed
 */
export class DomainVerificationFailed extends NowError<{
  domain: string,
  purchased: boolean,
  txtVerification: TXTVerificationError,
  nsVerification: NSVerificationError
}> {
  constructor({ domain, nsVerification, txtVerification, purchased = false }: { domain: string, nsVerification: NSVerificationError, txtVerification: TXTVerificationError, purchased: boolean }) {
    super({
      code: 'DOMAIN_VERIFICATION_FAILED',
      meta: { domain, nsVerification, txtVerification, purchased },
      message: `We can't verify the domain ${domain}. Both Name Servers and DNS TXT verifications failed.`
    });
  }
}

/**
 * Helper type for DomainVerificationFailed
 */
export type NSVerificationError = {
  intendedNameservers: string[]
  nameservers: string[]
}

/**
 * Helper type for DomainVerificationFailed
 */
export type TXTVerificationError = {
  verificationRecord: string,
  values: string[]
}

/**
 * Used when a domain is validated because we tried to add it to an account
 * via API or for any other reason.
 */
export class InvalidDomain extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'INVALID_DOMAIN',
      meta: { domain },
      message: `The domain ${domain} is not valid.`
    });
  }
}

/**
 * Returned when the user checks the price of a domain but the TLD
 * of the given name is not supported.
 */
export class UnsupportedTLD extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'UNSUPPORTED_TLD',
      meta: { domain },
      message: `The TLD for domain name ${domain} is not supported.`
    });
  }
}

/**
 * Returned when the user tries to purchase a domain but the API returns
 * an error telling that it is not available.
 */
export class DomainNotAvailable extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_AVAILABLE',
      meta: { domain },
      message: `The domain ${domain} is not available to be purchased.`
    });
  }
}

/**
 * Returned when the domain purchase service is not available for reasons
 * that are out of our control.
 */
export class DomainServiceNotAvailable extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_SERVICE_NOT_AVAILABLE',
      meta: { domain },
      message: `The domain purchase is unavailable, try again later.`
    });
  }
}

/**
 * Returned when there is an expected error during the domain purchase.
 */
export class UnexpectedDomainPurchaseError extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'UNEXPECTED_DOMAIN_PURCHASE_ERROR',
      meta: { domain },
      message: `An unexpected error happened while purchasing.`
    });
  }
}
