// @flow
import { Now, Output } from '../../util/types'
import type { Alias } from '../../util/types'

function getSafeAlias(alias: string) {
  return alias
    .replace(/^https:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()
}

export default async function findAliasByAliasOrId(output: Output, now: Now, aliasOrId: string): Promise<Alias> {
  return now.fetch(`/now/aliases/${encodeURIComponent(getSafeAlias(aliasOrId))}`);
}
