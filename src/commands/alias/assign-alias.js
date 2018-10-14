// @flow
import stamp from '../../util/output/stamp';
import { Now, Output } from '../../util/types';
import setDeploymentScale from '../../util/scale/set-deployment-scale';
import waitForScale from '../../util/scale/wait-verify-deployment-scale';
import type { Deployment } from '../../util/types';
import * as Errors from '../../util/errors';

import createAlias from './create-alias';
import deploymentShouldCopyScale from './deployment-should-copy-scale';
import deploymentShouldDownscale from './deployment-should-downscale';
import fetchDeploymentFromAlias from './get-deployment-from-alias';
import getDeploymentDownscalePresets from './get-deployment-downscale-presets';
import getPreviousAlias from './get-previous-alias';
import setupDomain from './setup-domain';

// $FlowFixMe
const NOW_SH_REGEX = /\.now\.sh$/;

async function assignAlias(
  output: Output,
  now: Now,
  deployment: Deployment,
  alias: string,
  contextName: string,
  noVerify: boolean
) {
  const prevAlias = await getPreviousAlias(output, now, alias);
  let externalDomain = false;

  // If there was a previous deployment, we should fetch it to scale and downscale later
  const prevDeployment = await fetchDeploymentFromAlias(
    output,
    now,
    contextName,
    prevAlias,
    deployment
  );

  if (
    prevDeployment instanceof Errors.DeploymentPermissionDenied ||
    prevDeployment instanceof Errors.DeploymentNotFound
  ) {
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
        now,
        deployment.uid,
        prevDeployment.scale,
        deployment.url
      );
      if (
        result instanceof Errors.NotSupportedMinScaleSlots ||
        result instanceof Errors.ForbiddenScaleMinInstances ||
        result instanceof Errors.ForbiddenScaleMaxInstances ||
        result instanceof Errors.InvalidScaleMinMaxRelation
      ) {
        return result;
      }

      output.log(
        `Scale rules copied from previous alias ${prevDeployment.url} ${scaleStamp()}`
      );
      if (!noVerify) {
        const result = await waitForScale(
          output,
          now,
          deployment.uid,
          prevDeployment.scale
        );
        if (result instanceof Errors.VerifyScaleTimeout) {
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
    const result = await setupDomain(output, now, alias, contextName);
    if (
      result instanceof Errors.DomainNameserversNotFound ||
      result instanceof Errors.DomainNotFound ||
      result instanceof Errors.DomainNotVerified ||
      result instanceof Errors.DomainPermissionDenied ||
      result instanceof Errors.DomainVerificationFailed ||
      result instanceof Errors.InvalidCoupon ||
      result instanceof Errors.MissingCreditCard ||
      result instanceof Errors.CDNNeedsUpgrade ||
      result instanceof Errors.PaymentSourceNotFound ||
      result instanceof Errors.UnsupportedTLD ||
      result instanceof Errors.UsedCoupon ||
      result instanceof Errors.UserAborted
    ) {
      return result;
    }

    // Assign if the domain is external to request wildcard or normal certificate
    externalDomain = result.isExternal;
  }

  // Create the alias and the certificate if it's missing
  const record = await createAlias(
    output,
    now,
    contextName,
    deployment,
    alias,
    externalDomain
  );
  if (
    record instanceof Errors.AliasInUse ||
    record instanceof Errors.CantSolveChallenge ||
    record instanceof Errors.DeploymentNotFound ||
    record instanceof Errors.DomainConfigurationError ||
    record instanceof Errors.DomainPermissionDenied ||
    record instanceof Errors.DomainsShouldShareRoot ||
    record instanceof Errors.DomainValidationRunning ||
    record instanceof Errors.InvalidAlias ||
    record instanceof Errors.InvalidWildcardDomain ||
    record instanceof Errors.TooManyCertificates ||
    record instanceof Errors.TooManyRequests
  ) {
    return record;
  }

  // Downscale if the previous deployment is not static and doesn't have the minimal presets
  if (prevDeployment !== null && prevDeployment.type !== 'STATIC') {
    if (await deploymentShouldDownscale(output, now, prevDeployment)) {
      await setDeploymentScale(
        output,
        now,
        prevDeployment.uid,
        getDeploymentDownscalePresets(prevDeployment),
        prevDeployment.url
      );
      output.log(`Previous deployment ${prevDeployment.url} downscaled`);
    }
  }

  return record;
}

export default assignAlias;
