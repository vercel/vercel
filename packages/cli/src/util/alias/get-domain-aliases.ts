import type { Alias } from '@vercel-internals/types';
import type Client from '../client';
import getAliases from './get-aliases';

export default async function getDomainAliases(client: Client, domain: string) {
  const { aliases } = await getAliases(client);
  return aliases.filter((alias: Alias) => alias.alias.endsWith(domain));
}
