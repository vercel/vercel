import generateCertForDeploy from './generate-cert-for-deploy';
import * as ERRORS_TS from '../errors-ts';
import * as ERRORS from '../errors';

export default async function createDeploy(output, now, contextName, paths, createArgs) {
  try {
    return await now.create(paths, createArgs);
  } catch (error) {
    // Means that the domain used as a suffix no longer exists
    if (error.code === 'domain_missing') {
      return new ERRORS_TS.DomainNotFound(error.value);
    }

    // If the domain used as a suffix is not verified, we fail
    if (error.code === 'domain_not_verified') {
      return new ERRORS_TS.DomainVerificationFailed(error.value);
    }

    // If the user doesn't have permissions over the domain used as a suffix we fail
    if (error.code === 'forbidden') {
      return new ERRORS_TS.DomainPermissionDenied(error.value, contextName);
    }

    if (error.code === 'bad_request' && error.keyword) {
      return new ERRORS.SchemaValidationFailed(error.message, error.keyword, error.dataPath, error.params);
    }

    // If the cert is missing we try to generate a new one and the retry
    if (error.code === 'cert_missing') {
      const result = await generateCertForDeploy(output, now, contextName, error.value);
      if (
        result instanceof ERRORS_TS.CantGenerateWildcardCert ||
        result instanceof ERRORS_TS.CantSolveChallenge ||
        result instanceof ERRORS_TS.CDNNeedsUpgrade ||
        result instanceof ERRORS_TS.DomainConfigurationError ||
        result instanceof ERRORS_TS.DomainPermissionDenied ||
        result instanceof ERRORS_TS.DomainsShouldShareRoot ||
        result instanceof ERRORS_TS.DomainValidationRunning ||
        result instanceof ERRORS_TS.DomainVerificationFailed ||
        result instanceof ERRORS_TS.TooManyCertificates ||
        result instanceof ERRORS_TS.TooManyRequests
      ) {
        return result;
      }
      return createDeploy(output, now, contextName, paths, createArgs);
    }

    // If the error is unknown, we just throw
    throw error;
  }
}
