import * as ERRORS from '../errors-ts';

export default function mapCertError(cns: string[], error: any) {
  if (error.code === 'too_many_requests') {
    return new ERRORS.TooManyRequests('certificates', error.retryAfter);
  }
  if (error.code === 'not_found') {
    return new ERRORS.DomainNotFound(error.domain);
  }

  if (error.code === 'configuration_error') {
    return new ERRORS.CertConfigurationError({
      cns,
      message: error.message,
      external: error.external,
      helpUrl: error.helpUrl,
      type: error.statusCode === 449 ? 'http-01' : 'dns-01'
    });
  }
  if (
    error.code === 'bad_domains' ||
    error.code === 'challenge_still_pending' ||
    error.code === 'common_name_domain_name_mismatch' ||
    error.code === 'conflicting_caa_record' ||
    error.code === 'domain_not_verified' ||
    error.code === 'invalid_cn' ||
    error.code === 'invalid_domain' ||
    error.code === 'rate_limited' ||
    error.code === 'should_share_root_domain' ||
    error.code === 'unauthorized_request_error' ||
    error.code === 'unsupported_challenge_priority' ||
    error.code === 'wildcard_not_allowed' ||
    error.code === 'validation_running'
  ) {
    return new ERRORS.CertError({
      cns,
      code: error.code,
      message: error.message,
      helpUrl: error.helpUrl
    });
  }

  if (error.code === 'dns_error') {
    return new ERRORS.CertsDNSError(error.detail, cns);
  }

  return null;
}
