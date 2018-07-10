// @flow
import wait from '../../../../util/output/wait'

import { Now } from '../types'
import * as Errors from '../errors'
import addDomain from './add-domain'

type VerifyOptions = { isExternal: boolean }

async function verifyDomain(now: Now, domain: string, contextName: string, opts: VerifyOptions) {
  const cancelMessage = wait('Setting up and verifying the domain')
  const result = await addDomain(now, domain, contextName, opts.isExternal)
  cancelMessage()
  if (
    (result instanceof Errors.CDNNeedsUpgrade) ||
    (result instanceof Errors.DomainPermissionDenied) ||
    (result instanceof Errors.DomainVerificationFailed)
  ) {
    return result
  } else if (result instanceof Errors.DomainAlreadyExists) {
    return undefined;
  } else if (result.verified === false) {
    return new Errors.DomainNotVerified(domain)
  }
}

export default verifyDomain
