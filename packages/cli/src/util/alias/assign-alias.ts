import type { Deployment } from '@vercel-internals/types';
import { Output } from '../output/index.js';
import Client from '../client.js';
import createAlias from './create-alias.js';
import isDomainExternal from '../domains/is-domain-external.js';
import setupDomain from '../domains/setup-domain.js';

export default async function assignAlias(
  output: Output,
  client: Client,
  deployment: Deployment,
  alias: string,
  contextName: string
) {
  let externalDomain = false;

  // Check if the alias is a custom domain, because then
  // we have to configure the DNS records and certificate
  if (
    alias.indexOf('.') !== -1 &&
    !alias.endsWith('.now.sh') &&
    !alias.endsWith('.vercel.app')
  ) {
    // Now the domain shouldn't be available and it might or might not belong to the user
    const result = await setupDomain(output, client, alias, contextName);
    if (result instanceof Error) {
      return result;
    }

    // Assign if the domain is external to request wildcard or normal certificate
    externalDomain = isDomainExternal(result);
  }

  // Create the alias and the certificate if it's missing
  const record = await createAlias(
    output,
    client,
    contextName,
    deployment,
    alias,
    externalDomain
  );

  return record;
}
