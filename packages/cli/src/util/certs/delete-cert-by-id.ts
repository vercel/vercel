import Client from '../client.js';
import { Output } from '../output/index.js';

export default async function deleteCertById(
  output: Output,
  client: Client,
  id: string
) {
  return client.fetch(`/v5/now/certs/${id}`, {
    method: 'DELETE',
  });
}
