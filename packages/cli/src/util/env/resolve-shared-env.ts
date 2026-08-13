import type Client from '../client';
import getSharedEnvRecords, {
  type SharedEnvVariable,
} from './get-shared-env-records';

const ID_PREFIX = 'env_';

export type ResolveSharedEnvResult =
  | { status: 'found'; record: SharedEnvVariable }
  | { status: 'not_found' }
  | { status: 'ambiguous'; matches: SharedEnvVariable[] };

/**
 * Resolves a Shared Environment Variable by id or exact name through the list
 * endpoint. Resolution never uses the get-by-id endpoint, so the decrypted
 * secret value is never fetched.
 */
export default async function resolveSharedEnvVariable(
  client: Client,
  nameOrId: string
): Promise<ResolveSharedEnvResult> {
  const isId = nameOrId.startsWith(ID_PREFIX);
  const { data } = await getSharedEnvRecords(
    client,
    isId ? { ids: nameOrId, limit: 100 } : { search: nameOrId, limit: 100 }
  );

  const matches = isId
    ? data.filter(env => env.id === nameOrId)
    : data.filter(env => env.key === nameOrId);

  if (matches.length === 0) {
    return { status: 'not_found' };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', matches };
  }
  return { status: 'found', record: matches[0] };
}
