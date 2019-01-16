import Client from '../client';
import { Output } from '../output';

export default async function deleteCertById(
  output: Output,
  client: Client,
  id: string
) {
  return client.fetch(`/v3/now/certs/${id}`, {
    method: 'DELETE'
  });
}
