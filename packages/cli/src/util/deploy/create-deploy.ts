import generateCertForDeploy from './generate-cert-for-deploy';
import * as ERRORS_TS from '../errors-ts';
import * as ERRORS from '../errors';
import { NowError } from '../now-error';
import mapCertError from '../certs/map-cert-error';
import { Org } from '../../types';
import Now, { CreateOptions } from '..';
import Client from '../client';
import { ArchiveFormat, DeploymentError } from '@vercel/client';

export default async function createDeploy(
  client: Client,
  now: Now,
  contextName: string,
  paths: string[],
  createArgs: CreateOptions,
  org: Org,
  isSettingUpProject: boolean,
  cwd?: string,
  archive?: ArchiveFormat
): Promise<any | DeploymentError> {
  try {
    return await now.create(
      paths,
      createArgs,
      org,
      isSettingUpProject,
      archive,
      cwd
    );
  } catch (err: unknown) {
    if (ERRORS_TS.isAPIError(err)) {
      if (err.code === 'rate_limited') {
        throw new ERRORS_TS.DeploymentsRateLimited(err.message);
      }

      // Means that the domain used as a suffix no longer exists
      if (err.code === 'domain_missing') {
        throw new ERRORS_TS.DomainNotFound(err.value);
      }

      if (err.code === 'domain_not_found' && err.domain) {
        throw new ERRORS_TS.DomainNotFound(err.domain);
      }

      // This error occures when a domain used in the `alias`
      // is not yet verified
      if (err.code === 'domain_not_verified' && err.domain) {
        throw new ERRORS_TS.DomainNotVerified(err.domain);
      }

      // If the domain used as a suffix is not verified, we fail
      if (err.code === 'domain_not_verified' && err.value) {
        throw new ERRORS_TS.DomainVerificationFailed(err.value);
      }

      // If the domain isn't owned by the user
      if (err.code === 'not_domain_owner') {
        throw new ERRORS_TS.NotDomainOwner(err.message);
      }

      if (err.code === 'builds_rate_limited') {
        throw new ERRORS_TS.BuildsRateLimited(err.message);
      }

      // If the user doesn't have permissions over the domain used as a suffix we fail
      if (err.code === 'forbidden') {
        throw new ERRORS_TS.DomainPermissionDenied(err.value, contextName);
      }

      if (err.code === 'bad_request' && err.keyword) {
        throw new ERRORS.SchemaValidationFailed(
          err.message,
          err.keyword,
          err.dataPath,
          err.params
        );
      }

      if (err.code === 'domain_configured') {
        throw new ERRORS_TS.AliasDomainConfigured(err);
      }

      if (err.code === 'missing_build_script') {
        throw new ERRORS_TS.MissingBuildScript(err);
      }

      if (err.code === 'conflicting_file_path') {
        throw new ERRORS_TS.ConflictingFilePath(err);
      }

      if (err.code === 'conflicting_path_segment') {
        throw new ERRORS_TS.ConflictingPathSegment(err);
      }

      // If the cert is missing we try to generate a new one and the retry
      if (err.code === 'cert_missing') {
        const result = await generateCertForDeploy(
          client,
          contextName,
          err.value
        );

        if (result instanceof NowError) {
          return result;
        }

        return createDeploy(
          client,
          now,
          contextName,
          paths,
          createArgs,
          org,
          isSettingUpProject
        );
      }

      if (err.code === 'not_found') {
        throw new ERRORS_TS.DeploymentNotFound({ context: contextName });
      }

      const certError = mapCertError(err);
      if (certError) {
        return certError;
      }
    }

    // If the error is unknown, we just throw
    throw err;
  }
}
