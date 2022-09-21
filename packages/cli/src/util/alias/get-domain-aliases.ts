import getAliases from './get-aliases';
import type { Alias } from '../../types';
import type Client from '../client';

export default async function getDomainAliases(client: Client, domain: string) {
  const { aliases } = await getAliases(client);
  return aliases.filter((alias: Alias) => alias.alias.endsWith(domain));
}
