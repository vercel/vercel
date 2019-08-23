import Client from '../client';
import getAliases from './get-aliases';
import { Alias } from '../../types';

export default async function getDomainAliases(client: Client, domain: string) {
  const aliases = await getAliases(client);
  return aliases.filter((alias: Alias) => alias.alias.endsWith(domain));
}
