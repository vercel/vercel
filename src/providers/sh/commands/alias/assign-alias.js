// @flow
import chalk from 'chalk'
import plural from 'pluralize'
import stamp from '../../../../util/output/stamp'

import * as Errors from './errors'
import { Now, Output } from './types'
import createAlias from './create-alias'
import deploymentShouldCopyScale from './deployment-should-copy-scale'
import deploymentShouldDowscale from './deployment-should-dowscale'
import fetchDeploymentFromAlias from './get-deployment-from-alias'
import getDeploymentDownscalePresets from './get-deployment-downscale-presets'
import getPreviousAlias from './get-previous-alias'
import setDeploymentScale from './set-deployment-scale'
import setupDomain from './setup-domain'
import promptBool from './prompt-bool'
import waitForScale from './wait-for-scale'
import type { Alias, Deployment } from './types'

// $FlowFixMe
const isTTY = process.stdout.isTTY
const NOW_SH_REGEX = /\.now\.sh$/

async function assignAlias(output: Output, now: Now, deployment: Deployment, alias: string, contextName: string, noVerify: boolean) {
  const prevAlias = await getPreviousAlias(now, alias)

  // Ask for a confirmation if there are rules defined
  if (prevAlias && prevAlias.rules) {
    const aborted = await warnAliasOverwrite(output, prevAlias, deployment)
    if (aborted) {
      return aborted
    }
  }

  // If there was a previous deployment, we should fetch it to scale and downscale later
  const prevDeployment = await fetchDeploymentFromAlias(output, now, contextName, prevAlias, deployment)
  if ((prevDeployment instanceof Errors.DeploymentPermissionDenied) || (prevDeployment instanceof Errors.DeploymentNotFound)) {
    return prevDeployment
  }

  // If there was a prev deployment  that wasn't static we have to check if we should scale
  if (prevDeployment !== null && prevDeployment.type !== 'STATIC' && deployment.type !== 'STATIC') {
    if (deploymentShouldCopyScale(prevDeployment, deployment)) {
      const scaleStamp = stamp()
      await setDeploymentScale(output, now, deployment.uid, prevDeployment.scale)
      if (!noVerify) { await waitForScale(output, now, deployment.uid, prevDeployment.scale) }
      output.success(`Scale rules copied from previous alias ${prevDeployment.url} ${scaleStamp()}`);
    } else {
      output.debug(`Both deployments have the same scaling rules.`)
    }
  }

  // Check if the alias is a custom domain and if case we have a positive
  // we have to configure the DNS records and certificate
  if (!NOW_SH_REGEX.test(alias)) {
    output.log(`${chalk.bold(chalk.underline(alias))} is a custom domain.`)
    const result = await setupDomain(output, now, alias, contextName)
    if (
      (result instanceof Errors.DNSPermissionDenied) ||
      (result instanceof Errors.DomainNameserversNotFound) ||
      (result instanceof Errors.DomainNotVerified) ||
      (result instanceof Errors.DomainPermissionDenied) ||
      (result instanceof Errors.DomainVerificationFailed) ||
      (result instanceof Errors.NeedUpgrade) ||
      (result instanceof Errors.PaymentSourceNotFound) ||
      (result instanceof Errors.UserAborted)
    ) {
      return result
    }
  }

  // Create the alias and the certificate if it's missing
  const record = await createAlias(output, now, deployment, alias, contextName)
  if (
    (record instanceof Errors.AliasInUse) ||
    (record instanceof Errors.DeploymentNotFound) ||
    (record instanceof Errors.DomainConfigurationError) ||
    (record instanceof Errors.DomainPermissionDenied) ||
    (record instanceof Errors.DomainValidationRunning) ||
    (record instanceof Errors.InvalidAlias) ||
    (record instanceof Errors.NeedUpgrade) ||
    (record instanceof Errors.TooManyCertificates)
  ) {
    return record
  }

  // Downscale if the previous deployment is not static and doesn't have the minimal presets
  if (prevDeployment !== null && prevDeployment.type !== 'STATIC') {
    if (await deploymentShouldDowscale(output, now, prevDeployment)) {
      await setDeploymentScale(output, now, prevDeployment.uid, getDeploymentDownscalePresets(prevDeployment))
      output.success(`Previous deployment ${prevDeployment.url} downscaled`);
    }
  }

  return record
}

async function warnAliasOverwrite(output: Output, alias: Alias, deployment: Deployment) {
  if (isTTY) {
    const msg = `The alias ${alias.alias} has rules configured. Are you sure you want to remove them and use ${deployment.url}?`
    const confirmed: boolean = await promptBool(output, msg)
    if (!confirmed) {
      return new Errors.UserAborted()
    }
  } else {
    output.log(
      `Overwriting path alias with ${
        plural('rule', alias.rules.length, true)
      } to be a normal alias.`
    )
  }
}

export default assignAlias
