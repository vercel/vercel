// @flow
import psl from 'psl'
import joinWords from '../../../../util/output/join-words'
import stamp from '../../../../util/output/stamp'
import wait from '../../../../util/output/wait'
import * as Errors from '../../util/errors'
import { Now, Output } from '../../util/types'
import type { HTTPChallengeInfo } from '../../util/types'
import createCertForCns from '../../util/certs/create-cert-for-cns'

async function createCertificateForAlias(output: Output, now: Now, alias: string, context: string, httpChallengeInfo?: HTTPChallengeInfo) {
  const { domain, subdomain } = psl.parse(alias)
  const { cns, preferDNS } = getCertRequestSettings(alias, domain, subdomain, httpChallengeInfo)
  const cancelMessage = wait(`Generating a certificate...`)
  const certStamp = stamp()

  // Generate the certificate with the given parameters
  let cert = await createCertForCns(now, cns, context, { preferDNS })
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
    cert = await createCertForCns(now, [alias], context, { preferDNS })
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
  output.log(`Certificate for ${joinWords(cns)} (${cert.uid}) created ${certStamp()}`)
  return cert
}

function getCertRequestSettings(alias: string, domain: string, subdomain: string, httpChallengeInfo?: HTTPChallengeInfo) {
  if (httpChallengeInfo) {
    if (subdomain === null) {
      if (httpChallengeInfo.canSolveForRootDomain) {
        return { cns: [domain, `*.${domain}`], preferDNS: false }
      } else {
        return { cns: [alias], preferDNS: true }
      }
    } else {
      if (httpChallengeInfo.canSolveForRootDomain) {
        return { cns: [domain, `*.${domain}`], preferDNS: false }
      } else if (httpChallengeInfo.canSolveForSubdomain) {
        return { cns: [alias], preferDNS: false }
      } else {
        return { cns: [alias], preferDNS: true }
      }
    }
  } else {
    if(subdomain.includes('.')) {
      // Nested subdomains can't use wildcards
      return { cns: [alias], preferDNS: true }
    } else {
      return { cns: [domain, `*.${domain}`], preferDNS: false }
    }
  }
}

export default createCertificateForAlias
