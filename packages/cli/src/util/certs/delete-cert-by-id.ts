import type Client from '../client';

export default async function deleteCertById(client: Client, id: string) {
  return client.fetch(`/v5/certs/${id}`, {
    method: 'DELETE',
  });
}
