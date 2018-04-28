// @flow
import psl from 'psl'
import * as Errors from '../errors'
import { Now, Output } from '../types'
import createCertForCns from '../certs/create-cert-for-cns'
import setupDomain from '../../commands/alias/setup-domain'

export default async function generateCertForDeploy(output: Output, now: Now, contextName: string, deployURL: string) {
  const {domain} = psl.parse(deployURL)
  const result = await setupDomain(output, now, domain, contextName)
  if (
    (result instanceof Errors.DNSPermissionDenied) ||
    (result instanceof Errors.DomainNameserversNotFound) ||
    (result instanceof Errors.DomainNotVerified) ||
    (result instanceof Errors.DomainPermissionDenied) ||
    (result instanceof Errors.DomainVerificationFailed) ||
    (result instanceof Errors.MissingDomainDNSRecords) ||
    (result instanceof Errors.NeedUpgrade)
  ) {
    return result
  }

  // Generate the certificate with the given parameters
  let cert = await createCertForCns(now, [domain, `*.${domain}`], contextName, { preferDNS: false })
  if (
    (cert instanceof Errors.CantGenerateWildcardCert) ||
    (cert instanceof Errors.DomainConfigurationError) ||
    (cert instanceof Errors.DomainPermissionDenied) ||
    (cert instanceof Errors.DomainsShouldShareRoot) ||
    (cert instanceof Errors.DomainsShouldShareRoot) ||
    (cert instanceof Errors.DomainValidationRunning) ||
    (cert instanceof Errors.InvalidWildcardDomain) ||
    (cert instanceof Errors.TooManyCertificates) ||
    (cert instanceof Errors.TooManyRequests)
  ) {
    return cert
  }
}
