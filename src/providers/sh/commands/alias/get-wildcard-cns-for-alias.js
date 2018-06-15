// @flow
import psl from 'psl';

export default function getWildcardCNSForAlias(alias: string) {
  const { domain, subdomain } = psl.parse(alias);
  const secondLevel = subdomain && subdomain.includes('.') ? subdomain.split('.').slice(1).join('.') : null;
  const root = secondLevel ? `${secondLevel}.${domain}` : domain;
  return [root, `*.${root}`];
}

