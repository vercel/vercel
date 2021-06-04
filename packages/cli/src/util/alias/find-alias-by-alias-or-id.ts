import { Output } from '../output';
import { Alias } from '../../types';

import Client from '../client';

function getSafeAlias(alias: string): string {
  return alias
    .replace(/^https:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
}

export default async function findAliasByAliasOrId(
  output: Output,
  client: Client,
  aliasOrId: string
) {
  return client.fetch<Alias>(
    `/now/aliases/${encodeURIComponent(getSafeAlias(aliasOrId))}`
  );
}
