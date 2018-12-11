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

/**
 * Returned any time we prompt the user to make sure an action should be performed
 * and the user decides not to continue with the operation
 */
export class UserAborted extends NowError<{}> {
  constructor() {
    super({
      code: 'USER_ABORTED',
      meta: {},
      message: `The user aborted the operation.`
    });
  }
}

/**
 * This error is returned when we try to create a certificate and the API responds
 * with a configuration error that means that the HTTP challenge couldn't be solved
 * for the domain so it is misconfigured.
 */
export class DomainConfigurationError extends NowError<{ domain: string, subdomain: string, external: boolean }> {
  constructor(domain: string, subdomain: string, external: boolean) {
    super({
      code: 'DOMAIN_CONFIGURATION_ERROR',
      meta: { domain, subdomain, external },
      message: `The domain is unreachable to solve the HTTP challenge needed for the certificate.`
    });
  }
}

/**
 * Returned when the user tries to create a wildcard certificate but LE API returns
 * a rate limit error because there were too many certificates created already.
 */
export class TooManyCertificates extends NowError<{ domains: string[] }> {
  constructor(domains: string[]) {
    super({
      code: 'TOO_MANY_CERTIFICATES',
      meta: { domains },
      message: `Too many certificates already issued for exact set of domains: ${domains.join(', ')}`
    });
  }
}

/**
 * This error is returned when consuming an API that got rate limited because too
 * many requests where performed already. It gives a retryAfter parameter with the
 * time the user needs to wait.
 */
export class TooManyRequests extends NowError<{ api: string, retryAfter: number }> {
  constructor(api: string, retryAfter: number) {
    super({
      code: 'TOO_MANY_REQUESTS',
      meta: { api, retryAfter },
      message: `Rate limited. Too many requests to the same endpoint.`
    });
  }
}

/**
 * This error is returned when the user requests a certificate but there is a pending
 * certificate order being processed in the server.
 */
export class DomainValidationRunning extends NowError<{ domain: string }> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_VALIDATION_RUNNING',
      meta: { domain },
      message: `A domain verification is already in course for ${domain}`
    });
  }
}

/**
 * Returned when there was a attempt to create a certiicate for a set of
 * common names where the root domain is not shared between them.
 */
export class DomainsShouldShareRoot extends NowError<{ domains: string[] }> {
  constructor(domains: string[]) {
    super({
      code: 'CNS_SHOULD_SHARE_ROOT',
      meta: { domains },
      message: `All domains for a certificate should share the same root domain`
    });
  }
}

/**
 * Returned when in an attempt to create a certificate, the challenge could not
 * be solved by LE. It could be the dns or the http challenge.
 */
export class CantSolveChallenge extends NowError<{ domain: string, type: string }> {
  constructor(domain: string, type: string) {
    super({
      code: 'CANT_SOLVE_CHALLENGE',
      meta: { domain, type },
      message: `Can't solve ${type} challenge for domain ${domain}`
    });
  }
}

/**
 * This error is returned whenever an API call tries to fetch a deployment but
 * the deployment doesn't exist.
 */
export class DeploymentNotFound extends NowError<{ id: string, context: string }> {
  constructor(id: string, context: string) {
    super({
      code: 'DEPLOYMENT_NOT_FOUND',
      meta: { id, context },
      message: `Can't find the deployment ${id} under the context ${context}`
    });
  }
}

/**
 * Returned when the user tries to fetch explicitly a deployment but she
 * has no permissions under the given context.
 */
export class DeploymentPermissionDenied extends NowError<{ id: string, context: string }> {
  constructor(id: string, context: string) {
    super({
      code: 'DEPLOYMENT_PERMISSION_DENIED',
      meta: { id, context },
      message: `You don't have access to the deployment ${id} under ${context}.`
    });
  }
}

/**
 * Returned when we try to create an alias but the API returns an error telling
 * that the given alias is not valid.
 */
export class InvalidAlias extends NowError<{ alias: string }> {
  constructor(alias: string) {
    super({
      code: 'INVALID_ALIAS',
      meta: { alias },
      message: `The given alias ${alias} is not valid`
    });
  }
}

/**
 * Returned when we try to create an alias but the API failes with an error
 * telling that the alias is already in use by somebody else.
 */
export class AliasInUse extends NowError<{ alias: string }> {
  constructor(alias: string) {
    super({
      code: 'ALIAS_IN_USE',
      meta: { alias },
      message: `The alias is already in use`
    });
  }
}

/**
 * Returned when an action is performed against an API endpoint that requires
 * a certificate for a domain but the domain is missing. An example would
 * be alias.
 */
export class CertMissing extends NowError<{ domain: string}> {
  constructor(domain: string) {
    super({
      code: 'ALIAS_IN_USE',
      meta: { domain },
      message: `The alias is already in use`
    });
  }
}

export class ForbiddenScaleMinInstances extends NowError<{ url: string, min: number }> {
  constructor(url: string, min: number) {
    super({
      code: 'FORBIDDEN_SCALE_MIN_INSTANCES',
      meta: { url, min },
      message: `You can't scale to more than ${min} min instances with your current plan.`
    });
  }
}

export class ForbiddenScaleMaxInstances extends NowError<{ url: string, max: number }> {
  constructor(url: string, max: number) {
    super({
      code: 'FORBIDDEN_SCALE_MAX_INSTANCES',
      meta: { url, max },
      message: `You can't scale to more than ${max} max instances with your current plan.`
    });
  }
}

export class InvalidScaleMinMaxRelation extends NowError<{ url: string }> {
  constructor(url: string) {
    super({
      code: 'INVALID_SCALE_MIN_MAX_RELATION',
      meta: { url },
      message: `Min number of instances can't be higher than max.`
    });
  }
}

export class NotSupportedMinScaleSlots extends NowError<{ url: string }> {
  constructor(url: string) {
    super({
      code: 'NOT_SUPPORTED_MIN_SCALE_SLOTS',
      meta: { url },
      message: `Cloud v2 does not yet support setting a non-zero min scale setting.`
    });
  }
}

export class VerifyScaleTimeout extends NowError<{ timeout: number }> {
  constructor(timeout: number) {
    super({
      code: 'VERIFY_SCALE_TIMEOUT',
      meta: { timeout },
      message: `Instance verification timed out (${timeout}ms)`
    });
  }
}
