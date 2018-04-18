// @flow
import { Now } from '../../util/types'

export default async function deleteAliasById(now: Now, id: string) {
  return now.fetch(`/now/aliases/${id}`, {
    method: 'DELETE'
  })
}
