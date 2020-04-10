import { Output } from '../output';
import Client from '../client';
import { Secret } from '../../types';

export default async function getDecryptedSecret(
  output: Output,
  client: Client,
  secretId: string
): Promise<string> {
  if (!secretId) {
    return '';
  }
  output.debug(`Fetching decrypted secret ${secretId}`);
  const url = `/v2/now/secrets/${secretId}?decrypt=true`;
  const secret = await client.fetch<Secret>(url);
  return secret.value;
}
