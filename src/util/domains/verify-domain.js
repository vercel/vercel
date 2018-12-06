import chalk from 'chalk';
import retry from 'async-retry';
import wait from '../output/wait';
import { DomainVerificationFailed } from '../errors';

export default async function verifyDomain(now, domain, contextName) {
  const cancelWait = wait(`Verifying domain ${domain} under ${chalk.bold(contextName)}`);
  try {
    const verificationError = await performVerifyDomain(now, domain);
    cancelWait();
    return verificationError;
  } catch (error) {
    cancelWait();
    if (error.code === 'verification_failed') {
      return new DomainVerificationFailed({
        domain: error.name,
        nsVerification: error.nsVerification,
        txtVerification: error.txtVerification
      })
    }
    throw error;
  }
}

async function performVerifyDomain(now, domain) {
  return retry(
    async () => (
      now.fetch(`/v4/domains/${encodeURIComponent(domain)}/verify`, {
        body: { domain },
        method: 'POST'
      })
    ),
    { retries: 5, maxTimeout: 8000 }
  );
}
