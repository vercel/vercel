import generateCertForDeploy from './generate-cert-for-deploy';
import * as ERRORS_TS from '../errors-ts';
import * as ERRORS from '../errors';
import { NowError } from '../now-error';
import mapCertError from '../certs/map-cert-error';
import { Output } from '../output';
import { Org } from '../../types';
import Now from '..';
import Client from '../client';

export default async function createDeploy(
  output: Output,
  now: Now,
  contextName: string,
  paths: string[],
  createArgs: any,
  org: Org | null,
  isSettingUpProject: boolean,
  cwd?: string,
  client?: Client
) {
  try {
    return await now.create(paths, createArgs, org, isSettingUpProject, cwd);
  } catch (error) {
    if (error.code === 'rate_limited') {
      throw new ERRORS_TS.DeploymentsRateLimited(error.message);
    }

    // Means that the domain used as a suffix no longer exists
    if (error.code === 'domain_missing') {
      throw new ERRORS_TS.DomainNotFound(error.value);
    }

    if (error.code === 'domain_not_found' && error.domain) {
      throw new ERRORS_TS.DomainNotFound(error.domain);
    }

    // This error occures when a domain used in the `alias`
    // is not yet verified
    if (error.code === 'domain_not_verified' && error.domain) {
      throw new ERRORS_TS.DomainNotVerified(error.domain);
    }

    // If the domain used as a suffix is not verified, we fail
    if (error.code === 'domain_not_verified' && error.value) {
      throw new ERRORS_TS.DomainVerificationFailed(error.value);
    }

    // If the domain isn't owned by the user
    if (error.code === 'not_domain_owner') {
      throw new ERRORS_TS.NotDomainOwner(error.message);
    }

    if (error.code === 'builds_rate_limited') {
      throw new ERRORS_TS.BuildsRateLimited(error.message);
    }

    // If the user doesn't have permissions over the domain used as a suffix we fail
    if (error.code === 'forbidden') {
      throw new ERRORS_TS.DomainPermissionDenied(error.value, contextName);
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
      throw new ERRORS_TS.AliasDomainConfigured(error);
    }

    if (error.code === 'missing_build_script') {
      throw new ERRORS_TS.MissingBuildScript(error);
    }

    if (error.code === 'conflicting_file_path') {
      throw new ERRORS_TS.ConflictingFilePath(error);
    }

    if (error.code === 'conflicting_path_segment') {
      throw new ERRORS_TS.ConflictingPathSegment(error);
    }

    // If the cert is missing we try to generate a new one and the retry
    if (error.code === 'cert_missing') {
      const result = await generateCertForDeploy(
        output,
        client!,
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
      throw new ERRORS_TS.DeploymentNotFound({ context: contextName });
    }

    const certError = mapCertError(error);
    if (certError) {
      return certError;
    }

    // If the error is unknown, we just throw
    throw error;
  }
}
