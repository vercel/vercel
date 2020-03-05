import { stringify } from 'querystring';
import { Cert } from '../../types';
import { Output } from '../output';
import Client from '../client';
import isWildcardAlias from '../alias/is-wildcard-alias';

type Response = {
  certs: Cert[];
};

export default async function hasCertForDomain(
  output: Output,
  client: Client,
  domain: string
) {
  try {
    if (domain.endsWith('.now.sh')) {
      return true;
    }
    const { certs } = await client.fetch<Response>(
      `/v3/now/certs?${stringify({ domain })}`
    );
    const wildcardCn = isWildcardAlias(domain)
      ? domain
      : `*.${stripSubdomain(domain)}`;
    return certs.some(cert => {
      return cert.cns.some(cn => cn === domain || cn === wildcardCn);
    });
  } catch (error) {
    output.debug(`Error fetching certs for ${domain}: ${error.message}`);
    return false;
  }
}

function stripSubdomain(domain: string) {
  return domain
    .split('.')
    .slice(1)
    .join('.');
}
