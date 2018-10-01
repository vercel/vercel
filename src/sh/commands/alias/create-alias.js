// @flow
import wait from '../../../../util/output/wait'
import { Now, Output } from '../../util/types'
import * as Errors from '../../util/errors'
import createCertForAlias from './create-cert-for-alias'
import type { AliasRecord, Deployment } from '../../util/types'

async function createAlias(
  output: Output,
  now: Now,
  contextName: string,
  deployment: Deployment,
  alias: string,
  externalDomain: boolean
) {
  const cancelMessage = wait(`Creating alias`)
  try {
    const record: AliasRecord = await now.fetch(`/now/deployments/${deployment.uid}/aliases`, {
      method: 'POST',
      body: { alias }
    })
    cancelMessage()
    return record
  } catch (error) {
    cancelMessage()

    // If the certificate is missing we create it without expecting failures
    // then we call back the createAlias function
    if (error.code === 'cert_missing' || error.code === 'cert_expired') {
      const cert = await createCertForAlias(output, now, contextName, alias, !externalDomain)
      if (
        (cert instanceof Errors.CantSolveChallenge) ||
        (cert instanceof Errors.DomainConfigurationError) ||
        (cert instanceof Errors.DomainPermissionDenied) ||
        (cert instanceof Errors.DomainsShouldShareRoot) ||
        (cert instanceof Errors.DomainValidationRunning) ||
        (cert instanceof Errors.InvalidWildcardDomain) ||
        (cert instanceof Errors.TooManyCertificates) ||
        (cert instanceof Errors.TooManyRequests)
      ) {
        return cert
      } else {
        return createAlias(output, now, contextName, deployment, alias, !externalDomain)
      }
    }

    // The alias already exists so we fail in silence returning the id
    if (error.status === 409) {
      const record: AliasRecord = { uid: error.uid, alias: error.alias }
      return record
    }

    if (error.code === 'deployment_not_found') {
      return new Errors.DeploymentNotFound(deployment.uid, contextName)
    }

    // We do not support nested subdomains
    if (error.code === 'invalid_alias') {
      return new Errors.InvalidAlias(alias)
    }

    if (error.status === 403) {
      if (error.code === 'alias_in_use') {
        return new Errors.AliasInUse(alias)
      }

      if (error.code === 'forbidden') {
        return new Errors.DomainPermissionDenied(alias, contextName)
      }
    }

    throw error
  }
}

export default createAlias
