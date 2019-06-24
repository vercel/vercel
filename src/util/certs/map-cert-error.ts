import * as ERRORS from '../errors-ts';

export default function mapCertError(error: any, cns?: string[]) {
  const errorCode: string = error.code;
  if (errorCode === 'too_many_requests') {
    return new ERRORS.TooManyRequests('certificates', error.retryAfter);
  }
  if (errorCode === 'not_found') {
    return new ERRORS.DomainNotFound(error.domain);
  }

  if (errorCode === 'configuration_error') {
    return new ERRORS.CertConfigurationError({
      cns: cns || error.cns || [],
      message: error.message,
      external: error.external,
      helpUrl: error.helpUrl,
      type: error.statusCode === 449 ? 'http-01' : 'dns-01'
    });
  }

  if (
    errorCode === 'bad_domains' ||
    errorCode === 'challenge_still_pending' ||
    errorCode === 'common_name_domain_name_mismatch' ||
    errorCode === 'conflicting_caa_record' ||
    errorCode === 'domain_not_verified' ||
    errorCode === 'invalid_cn' ||
    errorCode === 'invalid_domain' ||
    errorCode === 'rate_limited' ||
    errorCode === 'should_share_root_domain' ||
    errorCode === 'unauthorized_request_error' ||
    errorCode === 'unsupported_challenge_priority' ||
    errorCode === 'wildcard_not_allowed' ||
    errorCode === 'validation_running' ||
    errorCode === 'dns_error' ||
    errorCode === 'challenge_error' ||
    errorCode === 'txt_record_not_found'
  ) {
    return new ERRORS.CertError({
      cns: cns || error.cns || [],
      code: errorCode,
      message: error.message,
      helpUrl: error.helpUrl
    });
  }

  return null;
}
