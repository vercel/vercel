import Client from '../client.js';
import getAliases from './get-aliases.js';
import type { Alias } from '@vercel-internals/types';

export default async function getDomainAliases(client: Client, domain: string) {
  const { aliases } = await getAliases(client);
  return aliases.filter((alias: Alias) => alias.alias.endsWith(domain));
}
