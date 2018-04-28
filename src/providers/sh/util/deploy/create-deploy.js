// @flow
import { Now, Output } from '../types'
import generateCertForDeploy from './generate-cert-for-deploy'
import * as Errors from '../errors'

export type CreateDeployError = 
  Errors.CantGenerateWildcardCert |
  Errors.DNSPermissionDenied |
  Errors.DomainConfigurationError |
  Errors.DomainNameserversNotFound |
  Errors.DomainNotFound |
  Errors.DomainNotVerified |
  Errors.DomainPermissionDenied |
  Errors.DomainsShouldShareRoot |
  Errors.DomainValidationRunning |
  Errors.DomainVerificationFailed |
  Errors.InvalidWildcardDomain |
  Errors.MissingDomainDNSRecords |
  Errors.NeedUpgrade |
  Errors.TooManyCertificates |
  Errors.TooManyRequests

export default async function createDeploy(output: Output, now: Now, contextName: string, paths: string[], createArgs: Object) {
  try {
    return await now.create(paths, createArgs)
  } catch (error) {
    // Means that the domain used as a suffix no longer exists
    if (error.code === 'domain_missing') {
      return new Errors.DomainNotFound(error.value)
    }

    // If the domain used as a suffix is not verified, we fail
    if (error.code === 'domain_not_verified') {
      return new Errors.DomainNotVerified(error.value)
    }

    // If the user doesn't have permissions over the domain used as a suffix we fail
    if (error.code === 'forbidden') {
      return new Errors.DomainPermissionDenied(error.value, contextName)
    }

    // If the cert is missing we try to generate a new one and the retry
    if (error.code === 'cert_missing') {
      const result = await generateCertForDeploy(output, now, contextName, error.value)
      if (
        (result instanceof Errors.CantGenerateWildcardCert) ||
        (result instanceof Errors.DNSPermissionDenied) ||
        (result instanceof Errors.DomainConfigurationError) ||
        (result instanceof Errors.DomainNameserversNotFound) ||
        (result instanceof Errors.DomainNotVerified) ||
        (result instanceof Errors.DomainPermissionDenied) ||
        (result instanceof Errors.DomainsShouldShareRoot) ||
        (result instanceof Errors.DomainValidationRunning) ||
        (result instanceof Errors.DomainVerificationFailed) ||
        (result instanceof Errors.InvalidWildcardDomain) ||
        (result instanceof Errors.MissingDomainDNSRecords) ||
        (result instanceof Errors.MissingDomainDNSRecords) ||
        (result instanceof Errors.NeedUpgrade) ||
        (result instanceof Errors.TooManyCertificates) ||
        (result instanceof Errors.TooManyRequests)
      ) {
        return result
      } else {
        return createDeploy(output, now, contextName, paths, createArgs)
      }
    }

    // If the error is unknown, we just throw
    throw error
  }  
}
