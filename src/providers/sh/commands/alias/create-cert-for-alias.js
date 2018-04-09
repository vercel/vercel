// @flow
import psl from 'psl'
import wait from '../../../../util/output/wait'
import * as Errors from '../../util/errors'
import { Now, Output } from '../../util/types'
import createCertForCns from '../../util/certs/create-cert-for-cns'

async function createCertificateForAlias(output: Output, now: Now, alias: string, context: string) {
  const cancelMessage = wait(`Generating a certificate...`)
  const { domain } = psl.parse(alias)
  let cert = await createCertForCns(now, [domain, `*.${domain}`], context)
  if (
    (cert instanceof Errors.DomainConfigurationError) ||
    (cert instanceof Errors.DomainPermissionDenied) ||
    (cert instanceof Errors.DomainsShouldShareRoot) ||
    (cert instanceof Errors.DomainValidationRunning) ||
    (cert instanceof Errors.InvalidWildcardDomain) ||
    (cert instanceof Errors.TooManyCertificates) ||
    (cert instanceof Errors.TooManyRequests)
  ) {
    cancelMessage()
    return cert
  }

  if (cert instanceof Errors.CantGenerateWildcardCert) {
    output.debug(`Falling back to a normal certificate`)
    cert = await createCertForCns(now, [alias], context)
    if (
      (cert instanceof Errors.DomainConfigurationError) ||
      (cert instanceof Errors.DomainPermissionDenied) ||
      (cert instanceof Errors.DomainsShouldShareRoot) ||
      (cert instanceof Errors.DomainValidationRunning) ||
      (cert instanceof Errors.InvalidWildcardDomain) ||
      (cert instanceof Errors.TooManyCertificates) ||
      (cert instanceof Errors.TooManyRequests)
    ) {
      cancelMessage()
      return cert
    }

    // This is completely unexpected and should never happens
    if (cert instanceof Errors.CantGenerateWildcardCert) {
      cancelMessage()
      throw cert
    }
  }

  cancelMessage()
  output.success(`Certificate for ${alias} successfuly created`)
  return cert
}

export default createCertificateForAlias
