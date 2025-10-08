import type { Deployment } from '@vercel-internals/types';
import * as ERRORS from '../errors-ts';
import type Client from '../client';
import createCertForAlias from '../certs/create-cert-for-alias';
import output from '../../output-manager';

export type AliasRecord = {
  uid: string;
  alias: string;
  created?: string;
  oldDeploymentId?: string;
};

export default async function createAlias(
  client: Client,
  contextName: string,
  deployment: Deployment,
  alias: string,
  externalDomain: boolean
) {
  output.spinner(`Creating alias`);
  const result = await performCreateAlias(
    client,
    contextName,
    deployment,
    alias
  );
  output.stopSpinner();

  if (result instanceof ERRORS.CertMissing) {
    const cert = await createCertForAlias(
      client,
      contextName,
      alias,
      !externalDomain
    );
    if (cert instanceof Error) {
      return cert;
    }

    output.spinner(`Creating alias`);
    const secondTry = await performCreateAlias(
      client,
      contextName,
      deployment,
      alias
    );
    output.stopSpinner();
    return secondTry;
  }

  return result;
}

async function performCreateAlias(
  client: Client,
  contextName: string,
  deployment: Deployment,
  alias: string
) {
  try {
    return await client.fetch<AliasRecord>(
      `/now/deployments/${deployment.id}/aliases`,
      {
        method: 'POST',
        body: { alias },
      }
    );
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'cert_missing' || err.code === 'cert_expired') {
        return new ERRORS.CertMissing(alias);
      }
      if (err.status === 409) {
        return { uid: err.uid, alias: err.alias } as AliasRecord;
      }
      if (err.code === 'deployment_not_found' || err.code === 'not_found') {
        return new ERRORS.DeploymentNotFound({
          context: contextName,
          id: deployment.id,
        });
      }
      if (err.code === 'gone') {
        return new ERRORS.DeploymentFailedAliasImpossible();
      }
      if (err.code === 'invalid_alias') {
        return new ERRORS.InvalidAlias(alias);
      }
      if (err.code === 'deployment_not_ready') {
        return new ERRORS.DeploymentNotReady({ url: deployment.url });
      }
      if (err.status === 403) {
        if (err.code === 'alias_in_use') {
          return new ERRORS.AliasInUse(alias);
        }
        if (err.code === 'forbidden') {
          return new ERRORS.DomainPermissionDenied(alias, contextName);
        }
      }
    }

    throw err;
  }
}
