import type Client from '../client';

export default async function deleteDrain(client: Client, id: string) {
  return client.fetch(`/v1/drains/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
