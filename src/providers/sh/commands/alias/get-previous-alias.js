// @flow
import { Output, Now } from '../../util/types'
import findAliasByAliasOrId from './find-alias-by-alias-or-id'
import type { Alias } from '../../util/types'

async function getPreviousAlias(output: Output, now: Now, alias: string): Promise<Alias | void> {
  return findAliasByAliasOrId(output, now, alias)
}

export default getPreviousAlias
