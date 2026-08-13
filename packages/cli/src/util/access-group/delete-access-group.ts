import type Client from '../client';

export default async function deleteAccessGroup(
  client: Client,
  idOrName: string
): Promise<void> {
  await client.fetch(`/v1/access-groups/${encodeURIComponent(idOrName)}`, {
    method: 'DELETE',
  });
}
