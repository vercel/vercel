// @flow
import psl from 'psl'
import retry from 'async-retry'
import wait from '../../../../util/output/wait'

import { Now } from './types'
import { DomainNotVerified, DomainPermissionDenied, DomainVerificationFailed, NeedUpgrade } from './errors'

type VerifyOptions = { isExternal: boolean }
type VerifyInfo = {
  uid: string,
  verified: boolean,
  created: string
}

async function verifyDomain(now: Now, alias: string, contextName: string, opts: VerifyOptions) {
  const cancelMessage = wait('Setting up and verifying the domain')
  const { domain, subdomain } = psl.parse(alias)
  try {
    const { verified } = await updateVerification(now, domain, opts.isExternal)
    cancelMessage()

    if (verified === false) {
      return new DomainNotVerified(domain)
    }
  } catch (error) {
    cancelMessage()
    if (error.status === 403) {
      return error.code === 'custom_domain_needs_upgrade'
        ? new NeedUpgrade()
        : new DomainPermissionDenied(domain, contextName)
    }

    if (error.status === 401 && error.code === 'verification_failed') {
      return new DomainVerificationFailed(domain, subdomain, error.verifyToken)
    }

    if (error.status !== 409) {
      // we can ignore the 409 errors since it means the domain
      // is already setup
      throw error
    }
  }
}

async function updateVerification(now: Now, domain: string, isExternal: boolean): Promise<VerifyInfo> {
  return retry(async (bail) => {
    try {
      return await now.fetch('/domains', {
        body: { name: domain, isExternal },
        method: 'POST',
      })
    } catch (err) {
      // retry in case the user has to setup a TXT record
      if (err.code !== 'verification_failed') {
        bail(err)
      } else {
        throw err
      }
    }
  }, { retries: 5, maxTimeout: 8000 })
}

export default verifyDomain
