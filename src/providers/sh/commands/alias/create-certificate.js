// @flow
import psl from 'psl'
import retry from 'async-retry'
import wait from '../../../../util/output/wait'
import {
  CantGenerateWildcardCert,
  DomainConfigurationError,
  DomainValidationRunning,
  TooManyCertificates
} from './errors'
import { Now, Output } from './types'

type Certificate = {
  uid: string,
  created: string,
  expiration: string,
  autoRenew: boolean,
  cns: Array<string>
}

async function createCertificate(output: Output, now: Now, alias: string) {
  const cancelMessage = wait(`Generating a certificate...`)
  const { domain, subdomain } = psl.parse(alias)
  let cert = await performCreateCertificate(now, domain, subdomain, [domain, `*.${domain}`])
  if (
    (cert instanceof DomainConfigurationError) ||
    (cert instanceof DomainValidationRunning) ||
    (cert instanceof TooManyCertificates)
  ) {
    cancelMessage()
    return cert
  }

  if (cert instanceof CantGenerateWildcardCert) {
    output.debug(`Falling back to a normal certificate`)
    cert = await performCreateCertificate(now, domain, subdomain, [alias])
    if (
      (cert instanceof DomainConfigurationError) ||
      (cert instanceof DomainValidationRunning) ||
      (cert instanceof TooManyCertificates)
    ) {
      cancelMessage()
      return cert
    }

    // This is completely unexpected and should never happens
    if (cert instanceof CantGenerateWildcardCert) {
      cancelMessage()
      throw cert
    }
  }

  cancelMessage()
  output.success(`Certificate for ${alias} successfuly created`)
  return cert
}

async function performCreateCertificate(now: Now, domain: string, subdomain: string, cns: string[]) {
  try {
    const certificate: Certificate = await retry(async (bail) => {
      try {
        return await now.fetch('/v3/now/certs', {
          method: 'POST',
          body: { domains: cns },
        })
      } catch (error) {
        // When it's a configuration error we should retry because of the DNS propagation
        // otherwise we bail to handle the error in the upper level
        if (error.code === 'configuration_error') {
          throw error
        } else {
          bail(error)
        }
      }
    }, { retries: 3, minTimeout: 5000, maxTimeout: 15000 })
    return certificate
  } catch (error) {
    if (error.code === 'configuration_error') {
      return new DomainConfigurationError(domain, subdomain, error.external)
    } else if (error.code === 'wildcard_not_allowed') {
      return new CantGenerateWildcardCert()
    } else if (error.code === 'rate_limited' || error.code === 'too_many_requests') {
      return new TooManyCertificates(domain)
    } else if (error.code === 'validation_running') {
      return new DomainValidationRunning(domain)
    } else {
      // Throw unexpected errors
      throw error
    }
  }
}

export default createCertificate
