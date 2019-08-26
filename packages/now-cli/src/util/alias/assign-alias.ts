import { Deployment } from '../../types';
import { Output } from '../output';
import * as ERRORS from '../errors-ts';
import Client from '../client';
import createAlias from './create-alias';
import deploymentShouldCopyScale from './deployment-should-copy-scale';
import deploymentShouldDownscale from './deployment-should-downscale';
import findAliasByAliasOrId from './find-alias-by-alias-or-id';
import getDeploymentDownscalePresets from './get-deployment-downscale-presets';
import getDeploymentFromAlias from './get-deployment-from-alias';
import isDomainExternal from '../domains/is-domain-external';
import setDeploymentScale from '../scale/set-deployment-scale';
import setupDomain from '../domains/setup-domain';
import stamp from '../output/stamp';
import waitForScale from '../scale/wait-verify-deployment-scale';

const NOW_SH_REGEX = /\.now\.sh$/;

export default async function assignAlias(
  output: Output,
  client: Client,
  deployment: Deployment,
  alias: string,
  contextName: string,
  noVerify: boolean
) {
  const prevAlias = await findAliasByAliasOrId(output, client, alias);
  let externalDomain = false;

  // If there was a previous deployment, we should fetch it to scale and downscale later
  let prevDeployment = await getDeploymentFromAlias(
    client,
    contextName,
    prevAlias,
    deployment
  );

  // If there is an alias laying around that points to a deleted
  // deployment, we need to account for it here.
  if (prevDeployment instanceof ERRORS.DeploymentNotFound) {
    prevDeployment = null;
  }

  if (prevDeployment instanceof Error) {
    return prevDeployment;
  }

  // If there was a prev deployment  that wasn't static we have to check if we should scale
  if (
    prevDeployment !== null &&
    prevDeployment.type !== 'STATIC' &&
    deployment.type !== 'STATIC'
  ) {
    if (deploymentShouldCopyScale(prevDeployment, deployment)) {
      const scaleStamp = stamp();
      const result = await setDeploymentScale(
        output,
        client,
        deployment.uid,
        prevDeployment.scale,
        deployment.url
      );
      if (result instanceof Error) {
        return result;
      }

      output.log(
        `Scale rules copied from previous alias ${
          prevDeployment.url
        } ${scaleStamp()}`
      );
      if (!noVerify) {
        const result = await waitForScale(
          output,
          client,
          deployment.uid,
          prevDeployment.scale
        );
        if (result instanceof ERRORS.VerifyScaleTimeout) {
          return result;
        }
      }
    } else {
      output.debug(`Both deployments have the same scaling rules.`);
    }
  }

  // Check if the alias is a custom domain and if case we have a positive
  // we have to configure the DNS records and certificate
  if (alias.indexOf('.') !== -1 && !NOW_SH_REGEX.test(alias)) {
    // Now the domain shouldn't be available and it might or might not belong to the user
    const result = await setupDomain(output, client, alias, contextName);
    if (result instanceof Error) {
      return result;
    }

    // Assign if the domain is external to request wildcard or normal certificate
    externalDomain = isDomainExternal(result);
  }

  // Create the alias and the certificate if it's missing
  const record = await createAlias(
    output,
    client,
    contextName,
    deployment,
    alias,
    externalDomain
  );
  if (record instanceof Error) {
    return record;
  }

  // Downscale if the previous deployment is not static and doesn't have the minimal presets
  if (prevDeployment !== null && prevDeployment.type !== 'STATIC') {
    if (await deploymentShouldDownscale(output, client, prevDeployment)) {
      await setDeploymentScale(
        output,
        client,
        prevDeployment.uid,
        getDeploymentDownscalePresets(prevDeployment),
        prevDeployment.url
      );
      output.log(`Previous deployment ${prevDeployment.url} downscaled`);
    }
  }

  return record;
}
