// @flow
import { Now, Output } from '../../util/types'
import type { Alias } from '../../util/types'

export default async function findAliasByAliasOrId(output: Output, now: Now, aliasOrId: string): Promise<Alias> {
  return now.fetch(`/now/aliases/${encodeURIComponent(aliasOrId)}`);
}
