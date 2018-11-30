//      
import wait from '../output/wait';


import * as Errors from '../errors';
import addDomain from './add-domain';

                                             

async function verifyDomain(
  now     ,
  domain        ,
  contextName        ,
  opts               
) {
  const cancelMessage = wait('Setting up and verifying the domain');
  const result = await addDomain(now, domain, contextName, opts.isExternal);
  cancelMessage();
  if (
    result instanceof Errors.CDNNeedsUpgrade ||
    result instanceof Errors.DomainPermissionDenied ||
    result instanceof Errors.DomainVerificationFailed
  ) {
    return result;
  } if (result instanceof Errors.DomainAlreadyExists) {
    return undefined;
  } if (result.verified === false) {
    return new Errors.DomainNotVerified(domain);
  }
}

export default verifyDomain;
