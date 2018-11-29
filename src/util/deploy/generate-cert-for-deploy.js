//      
import psl from 'psl';
import * as Errors from '../errors';

import createCertForCns from '../certs/create-cert-for-cns';
import setupDomain from '../../commands/alias/setup-domain';
import wait from '../output/wait';

export default async function generateCertForDeploy(
  output        ,
  now     ,
  contextName        ,
  deployURL        
) {
  const { domain } = psl.parse(deployURL);
  const cancelSetupWait = wait(`Setting custom suffix domain ${domain}`);
  const result = await setupDomain(output, now, domain, contextName);
  if (
    result instanceof Errors.DomainNameserversNotFound ||
    result instanceof Errors.DomainNotVerified ||
    result instanceof Errors.DomainPermissionDenied ||
    result instanceof Errors.DomainVerificationFailed ||
    result instanceof Errors.CDNNeedsUpgrade
  ) {
    cancelSetupWait();
    return result;
  } 
    cancelSetupWait();
  

  // Generate the certificate with the given parameters
  const cancelCertWait = wait(
    `Generating a wildcard certificate for ${domain}`
  );
  const cert = await createCertForCns(now, [domain, `*.${domain}`], contextName);
  if (
    cert instanceof Errors.CantGenerateWildcardCert ||
    cert instanceof Errors.CantSolveChallenge ||
    cert instanceof Errors.DomainConfigurationError ||
    cert instanceof Errors.DomainPermissionDenied ||
    cert instanceof Errors.DomainsShouldShareRoot ||
    cert instanceof Errors.DomainsShouldShareRoot ||
    cert instanceof Errors.DomainValidationRunning ||
    cert instanceof Errors.InvalidWildcardDomain ||
    cert instanceof Errors.TooManyCertificates ||
    cert instanceof Errors.TooManyRequests
  ) {
    cancelCertWait();
    return cert;
  } 
    cancelCertWait();
  
}
