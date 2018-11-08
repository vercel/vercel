// @flow
import { Now } from '../types';

export default async function removeAliasById(now: Now, id: string) {
  return now.fetch(`/now/aliases/${id}`, {
    method: 'DELETE'
  });
}
