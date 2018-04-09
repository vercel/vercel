// @flow
import wait from '../../../../util/output/wait'

import * as Errors from './errors'
import { Now, Output } from './types'
import createCertificate from './create-certificate'
import type { AliasRecord, Deployment } from './types'

async function createAlias(output: Output, now: Now, deployment: Deployment, alias: string, contextName: string) {
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
      const cert = await createCertificate(output, now, alias)
      if (
        (cert instanceof Errors.DomainConfigurationError) ||
        (cert instanceof Errors.DomainValidationRunning) ||
        (cert instanceof Errors.TooManyCertificates)
      ) {
        return cert
      } else {
        return createAlias(output, now, deployment, alias, contextName)
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
      if (error.code === 'custom_domain_needs_upgrade') {
        return new Errors.NeedUpgrade()
      }

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
