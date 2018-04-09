// @flow
import { Now } from './types'
import type { Alias } from './types'

async function getPreviousAlias(now: Now, alias: string): Promise<Alias | void> {
  const aliases = await now.listAliases()
  const safeAlias = getSafeAlias(alias)
  return aliases.find(a => a.alias === safeAlias)
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
