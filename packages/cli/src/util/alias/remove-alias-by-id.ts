import { Alias } from '../../types';
import Client from '../client';

export default async function removeAliasById(
  client: Client,
  id: string | Alias
) {
  return client.fetch(`/now/aliases/${id}`, {
    method: 'DELETE',
  });
}
