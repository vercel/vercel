// @flow
import joinWords from '../../../../util/output/join-words'
import stamp from '../../../../util/output/stamp'
import wait from '../../../../util/output/wait'
import * as Errors from '../../util/errors'
import { Now, Output } from '../../util/types'
import createCertForCns from '../../util/certs/create-cert-for-cns'
import getWildcardCnsForAlias from './get-wildcard-cns-for-alias'

async function createCertificateForAlias(output: Output, now: Now, alias: string, context: string) {
  const cns = getWildcardCnsForAlias(alias)
  const cancelMessage = wait(`Generating a certificate...`)
  const certStamp = stamp()

  // Generate the certificate with the given parameters
  let cert = await createCertForCns(now, cns, context)
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

  // When we can't generate a wildcard or the DNS settings are not
  // valid we can fallback to try to generate a normal certificate
  if ((cert instanceof Errors.CantGenerateWildcardCert)) {
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
      throw cert
    }
  }

  cancelMessage()
  output.log(`Certificate for ${joinWords(cert.cns)} (${cert.uid}) created ${certStamp()}`)
  return cert
}

export default createCertificateForAlias
