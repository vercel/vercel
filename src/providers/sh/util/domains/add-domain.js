// @flow
import psl from 'psl'
import retry from 'async-retry'
import { Now } from '../types'
import * as Errors from '../errors'
import type { AddedDomain } from '../types'

export default async function addDomain(now: Now, domain: string, contextName: string, isExternal: boolean, cdnEnabled?: boolean) {
  const { domain: rootDomain, subdomain } = psl.parse(domain)
  try {
    return await performAddRequest(now, domain, isExternal, cdnEnabled);
  } catch (error) {
    if (error.status === 403) {
      return error.code === 'custom_domain_needs_upgrade'
        ? new Errors.NeedUpgrade()
        : new Errors.DomainPermissionDenied(rootDomain, contextName)
    }

    if (error.status === 401 && error.code === 'verification_failed') {
      return new Errors.DomainVerificationFailed(rootDomain, subdomain, error.verifyToken)
    }

    if (error.status === 409) {
      return new Errors.DomainAlreadyExists(error.uid, domain, contextName)
    }

    throw error
  }
}

async function performAddRequest(now: Now, domain: string, isExternal: boolean, cdnEnabled?: boolean): Promise<AddedDomain> {
  return retry(async (bail) => {
    try {
      const result: AddedDomain = await now.fetch('/domains', {
        body: { name: domain, isExternal, cdnEnabled },
        method: 'POST',
      })
      return result;
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
