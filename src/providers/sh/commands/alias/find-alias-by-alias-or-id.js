// @flow
import toHost from '../../util/to-host'
import getAliases from '../../util/alias/get-aliases'
import { Now, Output } from '../../util/types'
import type { Alias } from '../../util/types'

export default async function findAliasByAliasOrId(output: Output, now: Now, aliasOrId: string) {
  const aliases: Alias[] = await getAliases(now)
  const [key, val] = /\./.test(aliasOrId)
    ? ['alias', toHost(aliasOrId)]
    : ['uid', aliasOrId]

  return aliases.find(alias => {
    if (alias[key] === val) {
      output.debug(`matched alias ${alias.uid} by ${key} ${val}`)
      return true
    } else if (`${val}.now.sh` === alias.alias) {
      output.debug(`matched alias ${alias.uid} by url ${alias.alias}`)
      return true
    } else {
      return false
    }
  })
}
