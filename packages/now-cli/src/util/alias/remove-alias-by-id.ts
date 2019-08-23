import Client from '../client';

export default async function removeAliasById(client: Client, id: string) {
  return client.fetch(`/now/aliases/${id}`, {
    method: 'DELETE'
  });
}
