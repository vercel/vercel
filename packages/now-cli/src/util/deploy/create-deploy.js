import generateCertForDeploy from './generate-cert-for-deploy';
import * as ERRORS from '../errors';
import { NowError } from '../now-error';
import mapCertError from '../certs/map-cert-error';

export default async function createDeploy(
  output,
  now,
  contextName,
  paths,
  createArgs,
  org,
  isSettingUpProject,
  cwd
) {
  try {
    return await now.create(paths, createArgs, org, isSettingUpProject, cwd);
  } catch (error) {
    if (error.code === 'rate_limited') {
      throw new ERRORS.DeploymentsRateLimited(error.message);
    }

    // Means that the domain used as a suffix no longer exists
    if (error.code === 'domain_missing') {
      throw new ERRORS.DomainNotFound(error.value);
    }

    if (error.code === 'domain_not_found' && error.domain) {
      throw new ERRORS.DomainNotFound(error.domain);
    }

    // This error occures when a domain used in the `alias`
    // is not yet verified
    if (error.code === 'domain_not_verified' && error.domain) {
      throw new ERRORS.DomainNotVerified(error.domain);
    }

    // If the domain used as a suffix is not verified, we fail
    if (error.code === 'domain_not_verified' && error.value) {
      throw new ERRORS.DomainVerificationFailed(error.value);
    }

    // If the domain isn't owned by the user
    if (error.code === 'not_domain_owner') {
      throw new ERRORS.NotDomainOwner(error.message);
    }

    if (error.code === 'builds_rate_limited') {
      throw new ERRORS.BuildsRateLimited(error.message);
    }

    // If the user doesn't have permissions over the domain used as a suffix we fail
    if (error.code === 'forbidden') {
      throw new ERRORS.DomainPermissionDenied(error.value, contextName);
    }

    if (error.code === 'bad_request' && error.keyword) {
      throw new ERRORS.SchemaValidationFailed(
        error.message,
        error.keyword,
        error.dataPath,
        error.params
      );
    }

    if (error.code === 'domain_configured') {
      throw new ERRORS.AliasDomainConfigured(error);
    }

    if (error.code === 'missing_build_script') {
      throw new ERRORS.MissingBuildScript(error);
    }

    if (error.code === 'conflicting_file_path') {
      throw new ERRORS.ConflictingFilePath(error);
    }

    if (error.code === 'conflicting_path_segment') {
      throw new ERRORS.ConflictingPathSegment(error);
    }

    // If the cert is missing we try to generate a new one and the retry
    if (error.code === 'cert_missing') {
      const result = await generateCertForDeploy(
        output,
        now,
        contextName,
        error.value
      );
      if (result instanceof NowError) {
        return result;
      }
      return createDeploy(
        output,
        now,
        contextName,
        paths,
        createArgs,
        org,
        isSettingUpProject
      );
    }

    if (error.code === 'not_found') {
      throw new ERRORS.DeploymentNotFound({ context: contextName });
    }

    const certError = mapCertError(error);
    if (certError) {
      return certError;
    }

    // If the error is unknown, we just throw
    throw error;
  }
}
