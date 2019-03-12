import { Response } from 'fetch-h2';
import { NowError } from './now-error';
import param from './output/param';
import cmd from './output/cmd';

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
export class TeamDeleted extends NowError<'TEAM_DELETED', {}> {
  constructor() {
    super({
      code: 'TEAM_DELETED',
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
export class InvalidToken extends NowError<'NOT_AUTHORIZED', {}> {
  constructor() {
    super({
      code: `NOT_AUTHORIZED`,
      message: `The specified token is not valid`,
      meta: {}
    });
  }
}

/**
 * Thrown when we request a user using a token but the user no longer exists,
 * usually because it was deleted at some point.
 */
export class MissingUser extends NowError<'MISSING_USER', {}> {
  constructor() {
    super({
      code: 'MISSING_USER',
      message: `Not able to load user, missing from response`,
      meta: {}
    });
  }
}

/**
 * Thrown when a user tries to add a domain that exists already for a different
 * user under a different context.
 */
export class DomainAlreadyExists extends NowError<
  'DOMAIN_ALREADY_EXISTS',
  { domain: string }
> {
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
export class DomainPermissionDenied extends NowError<
  'DOMAIN_PERMISSION_DENIED',
  { domain: string; context: string }
> {
  constructor(domain: string, context: string) {
    super({
      code: 'DOMAIN_PERMISSION_DENIED',
      meta: { domain, context },
      message: `You don't have access to the domain ${domain} under ${context}.`
    });
  }
}

export class DomainExternal extends NowError<
  'DOMAIN_EXTERNAL',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_EXTERNAL',
      meta: { domain },
      message: `The domain ${domain} must point to zeit.world.`
    });
  }
}

/**
 * When information about a domain is requested but the domain doesn't exist
 */
export class SourceNotFound extends NowError<'SOURCE_NOT_FOUND', {}> {
  constructor() {
    super({
      code: 'SOURCE_NOT_FOUND',
      meta: {},
      message: `Not able to purchase. Please add a payment method using ${cmd(
        'now billing add'
      )}.`
    });
  }
}

export class InvalidTransferAuthCode extends NowError<
  'INVALID_TRANSFER_AUTH_CODE',
  { domain: string; authCode: string }
> {
  constructor(domain: string, authCode: string) {
    super({
      code: 'INVALID_TRANSFER_AUTH_CODE',
      meta: { domain, authCode },
      message: `The provided auth code does not match with the one expected by the current registar`
    });
  }
}

/**
 * When information about a domain is requested but the domain doesn't exist
 */
export class DomainNotFound extends NowError<
  'DOMAIN_NOT_FOUND',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_FOUND',
      meta: { domain },
      message: `The domain ${domain} can't be found.`
    });
  }
}

export class DomainNotVerified extends NowError<
  'DOMAIN_NOT_VERIFIED',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_VERIFIED',
      meta: { domain },
      message: `The domain ${domain} is not verified.`
    });
  }
}

/**
 * This error is returned when we perform a verification against the server and it
 * fails for both methods. It includes in the payload the domain name and metadata
 * to tell the reason why the verification failed
 */
export class DomainVerificationFailed extends NowError<
  'DOMAIN_VERIFICATION_FAILED',
  {
    domain: string;
    purchased: boolean;
    txtVerification: TXTVerificationError;
    nsVerification: NSVerificationError;
  }
> {
  constructor({
    domain,
    nsVerification,
    txtVerification,
    purchased = false
  }: {
    domain: string;
    nsVerification: NSVerificationError;
    txtVerification: TXTVerificationError;
    purchased: boolean;
  }) {
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
  intendedNameservers: string[];
  nameservers: string[];
};

/**
 * Helper type for DomainVerificationFailed
 */
export type TXTVerificationError = {
  verificationRecord: string;
  values: string[];
};

/**
 * Used when a domain is validated because we tried to add it to an account
 * via API or for any other reason.
 */
export class InvalidDomain extends NowError<
  'INVALID_DOMAIN',
  { domain: string }
> {
  constructor(domain: string, message?: string | null) {
    super({
      code: 'INVALID_DOMAIN',
      meta: { domain },
      message: message || `The domain ${domain} is not valid.`
    });
  }
}

/**
 * Returned when the user checks the price of a domain but the TLD
 * of the given name is not supported.
 */
export class UnsupportedTLD extends NowError<
  'UNSUPPORTED_TLD',
  { domain: string }
> {
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
export class DomainNotAvailable extends NowError<
  'DOMAIN_NOT_AVAILABLE',
  { domain: string }
> {
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
export class DomainServiceNotAvailable extends NowError<
  'DOMAIN_SERVICE_NOT_AVAILABLE',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_SERVICE_NOT_AVAILABLE',
      meta: { domain },
      message: `The domain purchase is unavailable, try again later.`
    });
  }
}

/**
 * Returned when the user tries to purchase a domain but the API returns
 * an error telling that it is not available.
 */
export class DomainNotTransferable extends NowError<
  'DOMAIN_NOT_TRANSFERABLE',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_TRANSFERABLE',
      meta: { domain },
      message: `The domain ${domain} is not available to be transferred.`
    });
  }
}

/**
 * Returned when there is an expected error during the domain purchase.
 */
export class UnexpectedDomainPurchaseError extends NowError<
  'UNEXPECTED_DOMAIN_PURCHASE_ERROR',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'UNEXPECTED_DOMAIN_PURCHASE_ERROR',
      meta: { domain },
      message: `An unexpected error happened while purchasing.`
    });
  }
}

/**
 * Returned when there is an expected error charging the card.
 */
export class DomainPaymentError extends NowError<'DOMAIN_PAYMENT_ERROR', {}> {
  constructor() {
    super({
      code: 'DOMAIN_PAYMENT_ERROR',
      meta: {},
      message: `Your card was declined.`
    });
  }
}

/**
 * Returned during purchase in alias when the domain was purchased but the
 * order is pending so the alias can't be completed yet
 */
export class DomainPurchasePending extends NowError<
  'DOMAIN_PURCHASE_PENDING',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_PURCHASE_PENDING',
      meta: { domain },
      message: `The domain purchase for ${domain} is pending.`
    });
  }
}

/**
 * Returned any time we prompt the user to make sure an action should be performed
 * and the user decides not to continue with the operation
 */
export class UserAborted extends NowError<'USER_ABORTED', {}> {
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
export class DomainConfigurationError extends NowError<
  'DOMAIN_CONFIGURATION_ERROR',
  { domain: string; subdomain: string | null; external: boolean }
> {
  constructor(domain: string, subdomain: string | null, external: boolean) {
    super({
      code: 'DOMAIN_CONFIGURATION_ERROR',
      meta: { domain, subdomain, external },
      message: `The domain is unreachable to solve the HTTP challenge needed for the certificate.`
    });
  }
}

export class CertOrderNotFound extends NowError<
  'CERT_ORDER_NOT_FOUND',
  { cns: string[] }
> {
  constructor(cns: string[]) {
    super({
      code: 'CERT_ORDER_NOT_FOUND',
      meta: { cns },
      message: `No cert order could be found for cns ${cns.join(' ,')}`
    });
  }
}

/**
 * Returned when the user tries to create a wildcard certificate but LE API returns
 * a rate limit error because there were too many certificates created already.
 */
export class TooManyCertificates extends NowError<
  'TOO_MANY_CERTIFICATES',
  { domains: string[] }
> {
  constructor(domains: string[]) {
    super({
      code: 'TOO_MANY_CERTIFICATES',
      meta: { domains },
      message: `Too many certificates already issued for exact set of domains: ${domains.join(
        ', '
      )}`
    });
  }
}

/**
 * This error is returned when consuming an API that got rate limited because too
 * many requests where performed already. It gives a retryAfter parameter with the
 * time the user needs to wait.
 */
export class TooManyRequests extends NowError<
  'TOO_MANY_REQUESTS',
  { api: string; retryAfter: number }
> {
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
export class DomainValidationRunning extends NowError<
  'DOMAIN_VALIDATION_RUNNING',
  { domain: string }
> {
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
export class DomainsShouldShareRoot extends NowError<
  'CNS_SHOULD_SHARE_ROOT',
  { domains: string[] }
> {
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
export class CantSolveChallenge extends NowError<
  'CANT_SOLVE_CHALLENGE',
  { domain: string; type: string }
> {
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
export class DeploymentNotFound extends NowError<
  'DEPLOYMENT_NOT_FOUND',
  { id: string; context: string }
> {
  constructor({ context, id = '' }: { context: string, id: string }) {
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
export class DeploymentPermissionDenied extends NowError<
  'DEPLOYMENT_PERMISSION_DENIED',
  { id: string; context: string }
> {
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
export class InvalidAlias extends NowError<'INVALID_ALIAS', { alias: string }> {
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
export class AliasInUse extends NowError<'ALIAS_IN_USE', { alias: string }> {
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
export class CertMissing extends NowError<'ALIAS_IN_USE', { domain: string }> {
  constructor(domain: string) {
    super({
      code: 'ALIAS_IN_USE',
      meta: { domain },
      message: `The alias is already in use`
    });
  }
}

export class ForbiddenScaleMinInstances extends NowError<
  'FORBIDDEN_SCALE_MIN_INSTANCES',
  { url: string; max: number }
> {
  constructor(url: string, max: number) {
    super({
      code: 'FORBIDDEN_SCALE_MIN_INSTANCES',
      meta: { url, max },
      message: `You can't scale to more than ${max} min instances with your current plan.`
    });
  }
}

export class ForbiddenScaleMaxInstances extends NowError<
  'FORBIDDEN_SCALE_MAX_INSTANCES',
  { url: string; max: number }
> {
  constructor(url: string, max: number) {
    super({
      code: 'FORBIDDEN_SCALE_MAX_INSTANCES',
      meta: { url, max },
      message: `You can't scale to more than ${max} max instances with your current plan.`
    });
  }
}

export class InvalidScaleMinMaxRelation extends NowError<
  'INVALID_SCALE_MIN_MAX_RELATION',
  { url: string }
> {
  constructor(url: string) {
    super({
      code: 'INVALID_SCALE_MIN_MAX_RELATION',
      meta: { url },
      message: `Min number of instances can't be higher than max.`
    });
  }
}

export class NotSupportedMinScaleSlots extends NowError<
  'NOT_SUPPORTED_MIN_SCALE_SLOTS',
  { url: string }
> {
  constructor(url: string) {
    super({
      code: 'NOT_SUPPORTED_MIN_SCALE_SLOTS',
      meta: { url },
      message: `Cloud v2 does not yet support setting a non-zero min scale setting.`
    });
  }
}

export class VerifyScaleTimeout extends NowError<
  'VERIFY_SCALE_TIMEOUT',
  { timeout: number }
> {
  constructor(timeout: number) {
    super({
      code: 'VERIFY_SCALE_TIMEOUT',
      meta: { timeout },
      message: `Instance verification timed out (${timeout}ms)`
    });
  }
}

export class CantParseJSONFile extends NowError<
  'CANT_PARSE_JSON_FILE',
  { file: string }
> {
  constructor(file: string) {
    super({
      code: 'CANT_PARSE_JSON_FILE',
      meta: { file },
      message: `Can't parse json file`
    });
  }
}

export class CantFindConfig extends NowError<
  'CANT_FIND_CONFIG',
  { paths: string[] }
> {
  constructor(paths: string[]) {
    super({
      code: 'CANT_FIND_CONFIG',
      meta: { paths },
      message: `Can't find a configuration file in the given locations.`
    });
  }
}

export class FileNotFound extends NowError<'FILE_NOT_FOUND', { file: string }> {
  constructor(file: string) {
    super({
      code: 'FILE_NOT_FOUND',
      meta: { file },
      message: `Can't find a file in provided location '${file}'.`
    });
  }
}

export class RulesFileValidationError extends NowError<
  'PATH_ALIAS_VALIDATION_ERROR',
  { location: string; message: string }
> {
  constructor(location: string, message: string) {
    super({
      code: 'PATH_ALIAS_VALIDATION_ERROR',
      meta: { location, message },
      message: `The provided rules format in file for path alias are invalid`
    });
  }
}

export class NoAliasInConfig extends NowError<'NO_ALIAS_IN_CONFIG', {}> {
  constructor() {
    super({
      code: 'NO_ALIAS_IN_CONFIG',
      meta: {},
      message: `There is no alias set up in config file.`
    });
  }
}

export class InvalidAliasInConfig extends NowError<
  'INVALID_ALIAS_IN_CONFIG',
  { value: any }
> {
  constructor(value: any) {
    super({
      code: 'INVALID_ALIAS_IN_CONFIG',
      meta: { value },
      message: `Invalid alias option in configuration.`
    });
  }
}

export class RuleValidationFailed extends NowError<
  'RULE_VALIDATION_FAILED',
  { message: string }
> {
  constructor(message: string) {
    super({
      code: 'RULE_VALIDATION_FAILED',
      meta: { message },
      message: `The server validation for rules failed`
    });
  }
}

export class InvalidMinForScale extends NowError<
  'INVALID_MIN_FOR_SCALE',
  { value: string }
> {
  constructor(value: string) {
    super({
      code: 'INVALID_MIN_FOR_SCALE',
      meta: { value },
      message: `Invalid <min> parameter "${value}". A number or "auto" were expected`
    });
  }
}

export class InvalidArgsForMinMaxScale extends NowError<
  'INVALID_ARGS_FOR_MIN_MAX_SCALE',
  { min: string }
> {
  constructor(min: string) {
    super({
      code: 'INVALID_ARGS_FOR_MIN_MAX_SCALE',
      meta: { min },
      message: `Invalid number of arguments: expected <min> ("${min}") and [max]`
    });
  }
}

export class InvalidMaxForScale extends NowError<
  'INVALID_MAX_FOR_SCALE',
  { value: string }
> {
  constructor(value: string) {
    super({
      code: 'INVALID_MAX_FOR_SCALE',
      meta: { value },
      message: `Invalid <max> parameter "${value}". A number or "auto" were expected`
    });
  }
}

export class WildcardNotAllowed extends NowError<
  'WILDCARD_NOT_ALLOWED',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'WILDCARD_NOT_ALLOWED',
      meta: { domain },
      message: `We can't generate a certificate for an external domain`
    });
  }
}

export class InvalidCert extends NowError<'INVALID_CERT', {}> {
  constructor() {
    super({
      code: 'INVALID_CERT',
      meta: {},
      message: `The provided custom certificate is invalid and couldn't be added`
    });
  }
}

export class DNSPermissionDenied extends NowError<
  'DNS_PERMISSION_DENIED',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'DNS_PERMISSION_DENIED',
      meta: { domain },
      message: `You don't have access to the DNS records of ${domain}.`
    });
  }
}

export class DomainRemovalConflict extends NowError<
  'domain_removal_conflict',
  {
    aliases: string[];
    certs: string[];
    pendingAsyncPurchase: boolean;
    suffix: boolean;
    transferring: boolean;
    resolvable: boolean;
  }
> {
  constructor({
    aliases,
    certs,
    message,
    pendingAsyncPurchase,
    resolvable,
    suffix,
    transferring
  }: {
    aliases: string[];
    certs: string[];
    message: string;
    pendingAsyncPurchase: boolean;
    resolvable: boolean;
    suffix: boolean;
    transferring: boolean;
  }) {
    super({
      code: 'domain_removal_conflict',
      meta: {
        aliases,
        certs,
        pendingAsyncPurchase,
        suffix,
        transferring,
        resolvable
      },
      message: message
    });
  }
}

export class DomainMoveConflict extends NowError<
  'domain_move_conflict',
  { pendingAsyncPurchase: boolean; suffix: boolean; resolvable: boolean }
> {
  constructor({
    message,
    pendingAsyncPurchase,
    resolvable,
    suffix
  }: {
    message: string;
    pendingAsyncPurchase: boolean;
    resolvable: boolean;
    suffix: boolean;
  }) {
    super({
      code: 'domain_move_conflict',
      meta: {
        pendingAsyncPurchase,
        resolvable,
        suffix
      },
      message: message
    });
  }
}

export class InvalidEmail extends NowError<'INVALID_EMAIL', { email: string }> {
  constructor(email: string, message: string = 'Invalid Email') {
    super({
      code: 'INVALID_EMAIL',
      message,
      meta: { email }
    });
  }
}

export class InvalidMoveDestination extends NowError<
  'INVALID_MOVE_DESTINATION',
  { destination: string }
> {
  constructor(destination: string) {
    super({
      code: 'INVALID_MOVE_DESTINATION',
      message: `Invalid move destination "${destination}"`,
      meta: { destination }
    });
  }
}

export class InvalidMoveToken extends NowError<
  'INVALID_MOVE_TOKEN',
  { token: string }
> {
  constructor(token: string) {
    super({
      code: 'INVALID_MOVE_TOKEN',
      message: `Invalid move token "${token}"`,
      meta: { token }
    });
  }
}
