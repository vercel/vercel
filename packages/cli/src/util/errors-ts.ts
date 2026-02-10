import bytes from 'bytes';
import { NowBuildError } from '@vercel/build-utils';
import { NowError } from './now-error';
import code from './output/code';
import { getCommandName } from './pkg-name';
import chalk from 'chalk';
import { isError } from '@vercel/error-utils';

/**
 * This error is thrown when there is an API error with a payload. The error
 * body includes the data that came in the payload plus status and a server
 * message. When it's a rate limit error in includes `retryAfter`
 */
export class APIError extends Error {
  status: number;
  serverMessage: string;
  link?: string;
  slug?: string;
  action?: string;
  retryAfterMs?: number | 'never';
  [key: string]: any;

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

    // HTTP 429 (Too Many Requests) or 503 (Service Unavailable) both are spec'd to serve retry-after headers
    if (response.status === 429 || response.status === 503) {
      const parsed = parseRetryAfterHeaderAsMillis(
        response.headers.get('Retry-After')
      );
      // If the retry-after header is missing or malfomed set to 0.  This ensures users will attempt a retry even in these cases.
      this.retryAfterMs = parsed ?? (response.status === 429 ? 0 : undefined);
    }
  }
}

export function parseRetryAfterHeaderAsMillis(
  header: string | null
): number | undefined {
  if (!header) return undefined;
  // The header might be a literal number of seconds or a formatted date
  // The date format is spec'd and date.parse should handle it.
  let retryAfterMs = Number(header) * 1000;
  if (Number.isNaN(retryAfterMs)) {
    retryAfterMs = Date.parse(header);
    if (Number.isNaN(retryAfterMs)) {
      return undefined;
    } else {
      retryAfterMs = retryAfterMs - Date.now();
    }
  }
  // If the date is in the past (clock skew? latency?) just retry immediately
  return Math.max(retryAfterMs, 0);
}

export function isAPIError(v: unknown): v is APIError {
  return isError(v) && 'status' in v;
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
      message: `Your team was deleted or you were removed from the team. You can switch to a different one using ${getCommandName(
        `switch`
      )}.`,
      meta: {},
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
      message: `The specified token is not valid. Use ${getCommandName(
        `login`
      )} to generate a new token.`,
      meta: {},
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
      meta: {},
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
      message: `The domain ${domain} already exists under a different context.`,
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
      message: `You don't have access to the domain ${domain} under ${context}.`,
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
      message: `The domain ${domain} must point to zeit.world.`,
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
      message: `Not able to purchase. Please add a payment method using the dashboard.`,
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
      message: `The provided auth code does not match with the one expected by the current registar`,
    });
  }
}

export class DomainRegistrationFailed extends NowError<
  'DOMAIN_REGISTRATION_FAILED',
  { domain: string }
> {
  constructor(domain: string, message: string) {
    super({
      code: 'DOMAIN_REGISTRATION_FAILED',
      meta: { domain },
      message,
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
  constructor(domain: string, contextName?: string) {
    super({
      code: 'DOMAIN_NOT_FOUND',
      meta: { domain },
      message: `Domain not found by "${domain}"${
        contextName ? ` under ${chalk.bold(contextName)}` : ''
      }.`,
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
      message: `The domain ${domain} is not verified.`,
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
    purchased = false,
  }: {
    domain: string;
    nsVerification: NSVerificationError;
    txtVerification: TXTVerificationError;
    purchased: boolean;
  }) {
    super({
      code: 'DOMAIN_VERIFICATION_FAILED',
      meta: { domain, nsVerification, txtVerification, purchased },
      message: `We can't verify the domain ${domain}. Both Name Servers and DNS TXT verifications failed.`,
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
      message: message || `The domain ${domain} is not valid.`,
    });
  }
}

export class NotDomainOwner extends NowError<'NOT_DOMAIN_OWNER', {}> {
  constructor(message: string) {
    super({
      code: 'NOT_DOMAIN_OWNER',
      meta: {},
      message,
    });
  }
}

export class InvalidDeploymentId extends NowError<
  'INVALID_DEPLOYMENT_ID',
  { id: string }
> {
  constructor(id: string) {
    super({
      code: 'INVALID_DEPLOYMENT_ID',
      meta: { id },
      message: `The deployment id "${id}" is not valid.`,
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
      message: `The TLD for domain name ${domain} is not supported.`,
    });
  }
}

/**
 * Returned when a given TLD can not be purchased via the CLI.
 */
export class TLDNotSupportedViaCLI extends NowError<
  'UNSUPPORTED_TLD_VIA_CLI',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'UNSUPPORTED_TLD_VIA_CLI',
      meta: { domain },
      message: `Purchased for the TLD for domain name ${domain} are not supported via the CLI. Use the REST API or the dashboard to purchase.`,
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
      message: `The domain ${domain} is not available to be purchased.`,
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
      message: `The domain ${domain} is not available to be transferred.`,
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
      message: `An unexpected error happened while purchasing.`,
    });
  }
}

/**
 * Returned when there is an expected error during the domain transfer.
 */
export class UnexpectedDomainTransferError extends NowError<
  'UNEXPECTED_DOMAIN_TRANSFER_ERROR',
  { domain: string }
> {
  constructor(domain: string) {
    super({
      code: 'UNEXPECTED_DOMAIN_TRANSFER_ERROR',
      meta: { domain },
      message: `An unexpected error happened while transferring.`,
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
      message: `Your card was declined.`,
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
      message: `The domain purchase for ${domain} is pending.`,
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
      message: `The user canceled the operation.`,
    });
  }
}

export class CertNotFound extends NowError<'CERT_NOT_FOUND', { id: string }> {
  constructor(id: string) {
    super({
      code: 'CERT_NOT_FOUND',
      meta: { id },
      message: `The cert ${id} can't be found.`,
    });
  }
}

export class CertsPermissionDenied extends NowError<
  'CERTS_PERMISSION_DENIED',
  { domain: string }
> {
  constructor(context: string, domain: string) {
    super({
      code: 'CERTS_PERMISSION_DENIED',
      meta: { domain },
      message: `You don't have access to ${domain}'s certs under ${context}.`,
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
      message: `No cert order could be found for cns ${cns.join(' ,')}`,
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
  { api: string; retryAfterMs: number }
> {
  constructor(api: string, retryAfterMs: number) {
    super({
      code: 'TOO_MANY_REQUESTS',
      meta: { api, retryAfterMs },
      message: `Rate limited. Too many requests to the same endpoint.`,
    });
  }
}

/**
 * Generic cert error that utilizes the API's response message
 * for more information
 */
type CertErrorCode =
  | 'bad_domains'
  | 'challenge_still_pending'
  | 'common_name_domain_name_mismatch'
  | 'conflicting_caa_record'
  | 'domain_not_verified'
  | 'invalid_cn'
  | 'invalid_domain'
  | 'rate_limited'
  | 'should_share_root_domain'
  | 'unauthorized_request_error'
  | 'unsupported_challenge_priority'
  | 'wildcard_not_allowed'
  | 'validation_running'
  | 'dns_error'
  | 'challenge_error'
  | 'txt_record_not_found';
export class CertError extends NowError<
  'CERT_ERROR',
  { cns: string[]; code: CertErrorCode; helpUrl?: string }
> {
  constructor({
    cns,
    code,
    message,
    helpUrl,
  }: {
    cns: string[];
    code: CertErrorCode;
    message: string;
    helpUrl?: string;
  }) {
    super({
      code: `CERT_ERROR`,
      meta: { cns, code, helpUrl },
      message,
    });
  }
}

export class CertConfigurationError extends NowError<
  'CERT_CONFIGURATION_ERROR',
  {
    cns: string[];
    type: 'http-01' | 'dns-01';
    external: boolean | null;
    helpUrl?: string;
  }
> {
  constructor({
    cns,
    message,
    external,
    type,
    helpUrl,
  }: {
    cns: string[];
    message: string;
    external: boolean | null;
    type: 'http-01' | 'dns-01';
    helpUrl?: string;
  }) {
    super({
      code: `CERT_CONFIGURATION_ERROR`,
      meta: { cns, helpUrl, external, type },
      message,
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
  constructor({ context, id = '' }: { context: string; id?: string }) {
    super({
      code: 'DEPLOYMENT_NOT_FOUND',
      meta: { id, context },
      message: `Can't find the deployment "${id}" under the context "${context}"`,
    });
  }
}

/**
 * This error is returned when trying to create an alias and
 * the deployment isn't ready yet.
 */
export class DeploymentNotReady extends NowError<
  'DEPLOYMENT_NOT_READY',
  { url: string }
> {
  constructor({ url = '' }: { url: string }) {
    super({
      code: 'DEPLOYMENT_NOT_READY',
      meta: { url },
      message: `The deployment https://${url} is not ready.`,
    });
  }
}

export class DeploymentFailedAliasImpossible extends NowError<
  'DEPLOYMENT_FAILED_ALIAS_IMPOSSIBLE',
  {}
> {
  constructor() {
    super({
      code: 'DEPLOYMENT_FAILED_ALIAS_IMPOSSIBLE',
      meta: {},
      message: `The deployment build has failed and cannot be aliased`,
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
      message: `You don't have access to the deployment ${id} under ${context}.`,
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
      message: `The given alias ${alias} is not valid`,
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
      message: `The alias is already in use`,
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
      message: `The alias is already in use`,
    });
  }
}

export class CantParseJSONFile extends NowError<
  'CANT_PARSE_JSON_FILE',
  { file: string; parseErrorLocation: string }
> {
  constructor(file: string, parseErrorLocation: string) {
    const message = `Can't parse json file ${file}: ${parseErrorLocation}`;
    super({
      code: 'CANT_PARSE_JSON_FILE',
      meta: { file, parseErrorLocation },
      message,
    });
  }
}

export class ConflictingConfigFiles extends NowBuildError {
  files: string[];

  constructor(files: string[], message?: string, link?: string) {
    super({
      code: 'CONFLICTING_CONFIG_FILES',
      message:
        message ||
        'Cannot use both a `vercel.json` and `now.json` file. Please delete the `now.json` file.',
      link: link || 'https://vercel.link/combining-old-and-new-config',
    });
    this.files = files;
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
      message: `Can't find a configuration file in the given locations.`,
    });
  }
}

export class WorkingDirectoryDoesNotExist extends NowError<
  'CWD_DOES_NOT_EXIST',
  {}
> {
  constructor() {
    super({
      code: 'CWD_DOES_NOT_EXIST',
      meta: {},
      message: 'The current working directory does not exist.',
    });
  }
}

export class FileNotFound extends NowError<'FILE_NOT_FOUND', { file: string }> {
  constructor(file: string) {
    super({
      code: 'FILE_NOT_FOUND',
      meta: { file },
      message: `Can't find a file in provided location '${file}'.`,
    });
  }
}

export class NoAliasInConfig extends NowError<'NO_ALIAS_IN_CONFIG', {}> {
  constructor() {
    super({
      code: 'NO_ALIAS_IN_CONFIG',
      meta: {},
      message: `There is no alias set up in config file.`,
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
      message: `Invalid alias option in configuration.`,
    });
  }
}

export class InvalidCert extends NowError<'INVALID_CERT', {}> {
  constructor() {
    super({
      code: 'INVALID_CERT',
      meta: {},
      message: `The provided custom certificate is invalid and couldn't be added`,
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
      message: `You don't have access to the DNS records of ${domain}.`,
    });
  }
}

export class DNSInvalidPort extends NowError<'DNS_INVALID_PORT', {}> {
  constructor() {
    super({
      code: 'DNS_INVALID_PORT',
      meta: {},
      message: `Invalid <port> parameter. A number was expected`,
    });
  }
}

export class DNSInvalidType extends NowError<
  'DNS_INVALID_TYPE',
  { type: string }
> {
  constructor(type: string) {
    super({
      code: 'DNS_INVALID_TYPE',
      meta: { type },
      message: `Invalid <type> parameter "${type}". Expected one of A, AAAA, ALIAS, CAA, CNAME, MX, SRV, TXT`,
    });
  }
}

export class DNSConflictingRecord extends NowError<
  'DNS_CONFLICTING_RECORD',
  { record: string }
> {
  constructor(record: string) {
    super({
      code: 'DNS_CONFLICTING_RECORD',
      meta: { record },
      message: ` A conflicting record exists "${record}".`,
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
    transferring,
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
        resolvable,
      },
      message,
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
    suffix,
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
        suffix,
      },
      message,
    });
  }
}

export class InvalidEmail extends NowError<'INVALID_EMAIL', { email: string }> {
  constructor(email: string, message: string = 'Invalid Email') {
    super({
      code: 'INVALID_EMAIL',
      message,
      meta: { email },
    });
  }
}

export class AccountNotFound extends NowError<
  'ACCOUNT_NOT_FOUND',
  { email: string }
> {
  constructor(
    email: string,
    message: string = `Please sign up: https://vercel.com/signup`
  ) {
    super({
      code: 'ACCOUNT_NOT_FOUND',
      message,
      meta: { email },
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
      meta: { destination },
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
      meta: { token },
    });
  }
}

export class NoBuilderCacheError extends NowError<'NO_BUILDER_CACHE', {}> {
  constructor() {
    super({
      code: 'NO_BUILDER_CACHE',
      message: 'Could not find cache directory for now-builders.',
      meta: {},
    });
  }
}

export class LambdaSizeExceededError extends NowError<
  'MAX_LAMBDA_SIZE_EXCEEDED',
  { size: number; maxLambdaSize: number }
> {
  constructor(size: number, maxLambdaSize: number) {
    super({
      code: 'MAX_LAMBDA_SIZE_EXCEEDED',
      message: `The lambda function size (${bytes(
        size
      ).toLowerCase()}) exceeds the maximum size limit (${bytes(
        maxLambdaSize
      ).toLowerCase()}).`,
      meta: { size, maxLambdaSize },
    });
  }
}

export class MissingDotenvVarsError extends NowError<
  'MISSING_DOTENV_VARS',
  { type: string; missing: string[] }
> {
  constructor(type: string, missing: string[]) {
    let message: string;

    if (missing.length === 1) {
      message = `Env var ${JSON.stringify(missing[0])} is not defined in ${code(
        type
      )} file`;
    } else {
      message = [
        `The following env vars are not defined in ${code(type)} file:`,
        ...missing.map(name => `  - ${JSON.stringify(name)}`),
      ].join('\n');
    }

    message += '\nRead more: https://err.sh/vercel/missing-env-file';

    super({
      code: 'MISSING_DOTENV_VARS',
      message,
      meta: { type, missing },
    });
  }
}

export class DeploymentsRateLimited extends NowError<
  'DEPLOYMENTS_RATE_LIMITED',
  {}
> {
  constructor(message: string) {
    super({
      code: 'DEPLOYMENTS_RATE_LIMITED',
      meta: {},
      message,
    });
  }
}

export class BuildsRateLimited extends NowError<'BUILDS_RATE_LIMITED', {}> {
  constructor(message: string) {
    super({
      code: 'BUILDS_RATE_LIMITED',
      meta: {},
      message,
    });
  }
}

export class ProjectNotFound extends NowError<'PROJECT_NOT_FOUND', {}> {
  constructor(nameOrId: string) {
    super({
      code: 'PROJECT_NOT_FOUND',
      meta: {},
      message: `There is no project for "${nameOrId}"`,
    });
  }
}

export class AliasDomainConfigured extends NowError<'DOMAIN_CONFIGURED', {}> {
  constructor({ message }: { message: string }) {
    super({
      code: 'DOMAIN_CONFIGURED',
      meta: {},
      message,
    });
  }
}

export class MissingBuildScript extends NowError<'MISSING_BUILD_SCRIPT', {}> {
  constructor({ message }: { message: string }) {
    super({
      code: 'MISSING_BUILD_SCRIPT',
      meta: {},
      message,
    });
  }
}

export class ConflictingFilePath extends NowError<'CONFLICTING_FILE_PATH', {}> {
  constructor({ message }: { message: string }) {
    super({
      code: 'CONFLICTING_FILE_PATH',
      meta: {},
      message,
    });
  }
}

export class ConflictingPathSegment extends NowError<
  'CONFLICTING_PATH_SEGMENT',
  {}
> {
  constructor({ message }: { message: string }) {
    super({
      code: 'CONFLICTING_PATH_SEGMENT',
      meta: {},
      message,
    });
  }
}

export class BuildError extends NowError<'BUILD_ERROR', {}> {
  constructor({
    message,
    meta,
  }: {
    message: string;
    meta: { entrypoint?: string };
  }) {
    super({
      code: 'BUILD_ERROR',
      meta,
      message,
    });
  }
}

interface SchemaValidationFailedMeta {
  message: string;
  keyword: string;
  dataPath: string;
  params: object;
}

export class SchemaValidationFailed extends NowError<
  'SCHEMA_VALIDATION_FAILED',
  SchemaValidationFailedMeta
> {
  constructor(
    message: string,
    keyword: string,
    dataPath: string,
    params: object
  ) {
    super({
      code: 'SCHEMA_VALIDATION_FAILED',
      meta: { message, keyword, dataPath, params },
      message: `Schema verification failed`,
    });
  }
}

interface InvalidLocalConfigMeta {
  value: string[];
}

export class InvalidLocalConfig extends NowError<
  'INVALID_LOCAL_CONFIG',
  InvalidLocalConfigMeta
> {
  constructor(value: string[]) {
    super({
      code: 'INVALID_LOCAL_CONFIG',
      meta: { value },
      message: `Invalid local config parameter [${value
        .map(localConfig => `"${localConfig}"`)
        .join(', ')}]. A string was expected.`,
    });
  }
}
