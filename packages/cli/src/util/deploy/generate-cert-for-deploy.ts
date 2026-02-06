import { parse } from 'tldts';
import output from '../../output-manager';
import createCertForCns from '../certs/create-cert-for-cns';
import type Client from '../client';
import setupDomain from '../domains/setup-domain';
import { InvalidDomain } from '../errors-ts';
import { NowError } from '../now-error';

export default async function generateCertForDeploy(
  client: Client,
  contextName: string,
  deployURL: string
) {
  const parsedDomain = parse(deployURL);
  const { domain } = parsedDomain;
  if (!domain) {
    return new InvalidDomain(deployURL);
  }

  output.spinner(`Setting custom suffix domain ${domain}`);
  const result = await setupDomain(client, domain, contextName);
  output.stopSpinner();
  if (result instanceof NowError) {
    return result;
  }

  // Generate the certificate with the given parameters
  output.spinner(`Generating a wildcard certificate for ${domain}`);
  const cert = await createCertForCns(
    client,
    [domain, `*.${domain}`],
    contextName
  );
  output.stopSpinner();
  if (cert instanceof NowError) {
    return cert;
  }
}
