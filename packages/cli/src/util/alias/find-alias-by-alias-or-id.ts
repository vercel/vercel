import { Output } from '../output';
import { Alias } from '../../types';

import Client from '../client';
import getSafeAlias from '../../util/alias/get-safe-alias';

export default async function findAliasByAliasOrId(
  output: Output,
  client: Client,
  aliasOrId: string
) {
  return client.fetch<Alias>(
    `/now/aliases/${encodeURIComponent(getSafeAlias(aliasOrId))}`
  );
}
