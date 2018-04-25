// @flow
import { Output, Now } from '../../util/types'
import findAliasByAliasOrId from './find-alias-by-alias-or-id'
import type { Alias } from '../../util/types'

async function getPreviousAlias(output: Output, now: Now, alias: string): Promise<Alias | void> {
  return findAliasByAliasOrId(output, now, getSafeAlias(alias))
}

function getSafeAlias(alias: string) {
  const _alias = alias
    .replace(/^https:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()

  return _alias.indexOf('.') === -1
    ? `${_alias}.now.sh`
    : _alias
}

export default getPreviousAlias
