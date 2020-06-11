import psl from 'psl';
import { NowError } from '../now-error';
import { Output } from '../output';
import Client from '../client';
import createCertForCns from '../certs/create-cert-for-cns';
import setupDomain from '../domains/setup-domain';
import { InvalidDomain } from '../errors-ts';

export default async function generateCertForDeploy(
  output: Output,
  client: Client,
  contextName: string,
  deployURL: string
) {
  const parsedDomain = psl.parse(deployURL);
  if (parsedDomain.error) {
    return new InvalidDomain(deployURL, parsedDomain.error.message);
  }

  const { domain } = parsedDomain;
  if (!domain) {
    return new InvalidDomain(deployURL);
  }

  const cancelSetupWait = output.spinner(
    `Setting custom suffix domain ${domain}`
  );
  const result = await setupDomain(output, client, domain, contextName);
  cancelSetupWait();
  if (result instanceof NowError) {
    return result;
  }

  // Generate the certificate with the given parameters
  const cancelCertWait = output.spinner(
    `Generating a wildcard certificate for ${domain}`
  );
  const cert = await createCertForCns(
    client,
    [domain, `*.${domain}`],
    contextName
  );
  cancelCertWait();
  if (cert instanceof NowError) {
    return cert;
  }
}
