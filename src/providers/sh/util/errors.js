// @flow
import { NowError } from './now-error'

/**
 * Create Alias Errors
 */
export class AliasInUse extends NowError<'ALIAS_IN_USE', {alias: string}> {
  constructor(alias: string) {
    super({
      code: 'ALIAS_IN_USE',
      meta: { alias },
      message: `The alias is already in use`
    })
  }
}

export class InvalidAlias extends NowError<'INVALID_ALIAS', {alias: string}> {
  constructor(alias: string) {
    super({
      code: 'INVALID_ALIAS',
      meta: { alias },
      message: `The alias you provided is invalid`
    })
  }
}

export class NeedUpgrade extends NowError<'NEED_UPGRADE', {}> {
  constructor() {
    super({
      code: 'NEED_UPGRADE',
      meta: {},
      message: `You're trying to use a feature that is restricted for premium users. Please upgrade`
    })
  }
}

export class DeploymentNotFound extends NowError<'DEPLOYMENT_NOT_FOUND', {id: string, context: string}> {
  constructor(id: string, context: string) {
    super({
      code: 'DEPLOYMENT_NOT_FOUND',
      meta: { id, context },
      message: `Can't find the deployment ${id} under the context ${context}`
    })
  }
}

/**
 * SetupDomainErrors
 */
export class DomainPermissionDenied extends NowError<'DOMAIN_PERMISSION_DENIED', {domain: string, context: string}> {
  constructor(domain: string, context: string) {
    super({
      code: 'DOMAIN_PERMISSION_DENIED',
      meta: { domain, context },
      message: `You don't have access to the domain ${domain} under ${context}.`
    })
  }
}

export class DeploymentPermissionDenied extends NowError<'DEPLOYMENT_PERMISSION_DENIED', {id: string, context: string}> {
  constructor(id: string, context: string) {
    super({
      code: 'DEPLOYMENT_PERMISSION_DENIED',
      meta: { id, context },
      message: `You don't have access to the deployment ${id} under ${context}.`
    })
  }
}

export class DNSPermissionDenied extends NowError<'DNS_PERMISSION_DENIED', {domain: string}> {
  constructor(domain: string) {
    super({
      code: 'DNS_PERMISSION_DENIED',
      meta: { domain },
      message: `You don't have access to the DNS records of ${domain}.`
    })
  }
}

export class DomainVerificationFailed extends NowError<'DOMAIN_VERIFICATION_FAILED', {domain: string, subdomain: string, token: string}> {
  constructor(domain: string, subdomain: string, token: string) {
    super({
      code: 'DOMAIN_VERIFICATION_FAILED',
      meta: { domain, subdomain, token },
      message: `We can't verify the ownership of ${subdomain}.${domain}. The owner should configure the DNS records`
    })
  }
}

export class DomainNotVerified extends NowError<'DOMAIN_NOT_VERIFIED', {domain: string}> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_VERIFIED',
      meta: { domain },
      message: `The domain ${domain} coudln't be verified so we can't operate with it`
    })
  }
}

export class DomainNotFound extends NowError<'DOMAIN_NOT_FOUND', {domain: string}> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_NOT_FOUND',
      meta: { domain },
      message: `The domain is available and should be purchased before running alias.`
    })
  }
}

export class UserAborted extends NowError<'USER_ABORTED', {}> {
  constructor() {
    super({
      code: 'USER_ABORTED',
      meta: {},
      message: `The user aborted the operation.`
    })
  }
}

/**
 * Alias configuration errors
 */
export class InvalidAliasTarget extends NowError<'INVALID_ALIAS_TARGET', {target: string}> {
  constructor(target: string) {
    super({
      code: 'INVALID_ALIAS_TARGET',
      meta: { target },
      message: `The target ${target} is not valid to be used as alias.`
    })
  }
}

export class InvalidAliasInConfig extends NowError<'INVALID_ALIAS_IN_CONFIG', {value: number | Object}> {
  constructor(value: any) {
    super({
      code: 'INVALID_ALIAS_IN_CONFIG',
      meta: { value },
      message: `Invalid alias option in configuration.`
    })
  }
}

export class NoAliasInConfig extends NowError<'NO_ALIAS_IN_CONFIG', {}> {
  constructor() {
    super({
      code: 'NO_ALIAS_IN_CONFIG',
      meta: {},
      message: `There is no alias set up in config file.`
    })
  }
}

export class FileNotFound extends NowError<'FILE_NOT_FOUND', {file: string}> {
  constructor(file: string) {
    super({
      code: 'FILE_NOT_FOUND',
      meta: { file },
      message: `Can't find a file in provided location '${file}'.`
    })
  }
}

export class CantFindConfig extends NowError<'CANT_FIND_CONFIG', {paths: string[]}> {
  constructor(paths: string[]) {
    super({
      code: 'CANT_FIND_CONFIG',
      meta: { paths },
      message: `Can't find a configuration file in the given locations.`
    })
  }
}

export class DomainNameserversNotFound extends NowError<'NAMESERVERS_NOT_FOUND', {domain: string}> {
  constructor(domain: string) {
    super({
      code: 'NAMESERVERS_NOT_FOUND',
      meta: { domain },
      message: `Can't get nameservers from ${domain}.`
    })
  }
}

export class PaymentSourceNotFound extends NowError<'PAYMENT_SOURCE_NOT_FOUND', {}> {
  constructor() {
    super({
      code: 'PAYMENT_SOURCE_NOT_FOUND',
      meta: {},
      message: `No credit cards found`
    })
  }
}

export class CantParseJSONFile extends NowError<'CANT_PARSE_JSON_FILE', {file: string}> {
  constructor(file: string) {
    super({
      code: 'CANT_PARSE_JSON_FILE',
      meta: { file },
      message: `Can't parse json file`
    })
  }
}

export class DomainConfigurationError extends NowError<'DOMAIN_CONFIGURATION_ERROR', {domain: string, subdomain: string, external: boolean}> {
  constructor(domain: string, subdomain: string, external: boolean) {
    super({
      code: 'DOMAIN_CONFIGURATION_ERROR',
      meta: { domain, subdomain, external },
      message: `The domain is unreachable to solve the HTTP challenge needed for the certificate.`
    })
  }
}

export class MissingDomainDNSRecords extends NowError<'MISSING_DOMAIN_DNS_RECORDS', {forRootDomain: boolean, forSubdomain: boolean}> {
  constructor({ forRootDomain, forSubdomain }: { forRootDomain: boolean, forSubdomain: boolean }) {
    super({
      code: 'MISSING_DOMAIN_DNS_RECORDS',
      meta: { forRootDomain, forSubdomain },
      message: `There are missing records to solve the ACME HTTP challenge`
    })
  }
}

export class CantGenerateWildcardCert extends NowError<'CANT_GENERATE_WILDCARD_CERT', {}> {
  constructor() {
    super({
      code: 'CANT_GENERATE_WILDCARD_CERT',
      meta: {},
      message: `We can't generate a certificate for an external domain`
    })
  }
}

export class TooManyCertificates extends NowError<'TOO_MANY_CERTIFICATES', {domains: string[]}> {
  constructor(domains: string[]) {
    super({
      code: 'TOO_MANY_CERTIFICATES',
      meta: { domains },
      message: `Too many certificates already issued for exact set of domains: ${domains.join(', ')}`
    })
  }
}

export class DomainValidationRunning extends NowError<'DOMAIN_VALIDATION_RUNNING', {domain: string}> {
  constructor(domain: string) {
    super({
      code: 'DOMAIN_VALIDATION_RUNNING',
      meta: { domain },
      message: `A domain verification is already in course for ${domain}`
    })
  }
}

export class RulesFileValidationError extends NowError<'PATH_ALIAS_VALIDATION_ERROR', {location: string, message: string}> {
  constructor(location: string, message: string) {
    super({
      code: 'PATH_ALIAS_VALIDATION_ERROR',
      meta: { location, message },
      message: `The provided rules format in file for path alias are invalid`
    })
  }
}

export class RuleValidationFailed extends NowError<'RULE_VALIDATION_FAILED', { message: string }> {
  constructor(message: string) {
    super({
      code: 'RULE_VALIDATION_FAILED',
      meta: { message },
      message: `The server validation for rules failed`
    })
  }
}

export class InvalidCert extends NowError<'INVALID_CERT', {}> {
  constructor() {
    super({
      code: 'INVALID_CERT',
      meta: {},
      message: `The provided custom certificate is invalid and couldn't be added`
    })
  }
}

export class TooManyRequests extends NowError<'TOO_MANY_REQUESTS', { api: string }> {
  constructor(api: string) {
    super({
      code: 'TOO_MANY_REQUESTS',
      meta: { api },
      message: `To made too many requests`
    })
  }
}

export class DomainsShouldShareRoot extends NowError<'CNS_SHOULD_SHARE_ROOT', { api: string }> {
  constructor(api: string) {
    super({
      code: 'CNS_SHOULD_SHARE_ROOT',
      meta: { api },
      message: `To made too many requests`
    })
  }
}

export class InvalidWildcardDomain extends NowError<'INVALID_WILDCARD_DOMAIN', { domain: string }> {
  constructor(domain: string) {
    super({
      code: 'INVALID_WILDCARD_DOMAIN',
      meta: { domain },
      message: `invalid_wildcard_domain`
    })
  }
}

export class VerifyScaleTimeout extends NowError<'VERIFY_SCALE_TIMEOUT', { timeout: number }> {
  constructor(timeout: number) {
    super({
      code: 'VERIFY_SCALE_TIMEOUT',
      meta: { timeout },
      message: `Instance verification timed out (${timeout}ms)`
    })
  }
}
