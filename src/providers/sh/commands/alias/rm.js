// @flow
import chalk from 'chalk'
import ms from 'ms'
import table from 'text-table'

import Now from '../../util'
import cmd from '../../../../util/output/cmd'
import getContextName from '../../util/get-context-name'
import removeAliasById from '../../util/alias/remove-alias-by-id'
import stamp from '../../../../util/output/stamp'
import strlen from '../../util/strlen'
import { CLIContext, Output } from '../../util/types'
import type { CLIAliasOptions, Alias } from '../../util/types'

import findAliasByAliasOrId from './find-alias-by-alias-or-id'
import promptBool from './prompt-bool'

export default async function rm(ctx: CLIContext, opts: CLIAliasOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const { apiUrl } = ctx;
  const contextName = getContextName(sh);
  const {['--debug']: debugEnabled} = opts;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const [aliasOrId] = args

  if (!aliasOrId) {
    output.error(`${cmd('now alias rm <alias>')} expects one argument`)
    return 1
  }

  if (args.length !== 1) {
    output.error(`Invalid number of arguments. Usage: ${chalk.cyan('`now alias rm <alias>`')}`)
    return 1
  }

  const alias: Alias | void = await findAliasByAliasOrId(output, now, aliasOrId)
  if (!alias) {
    output.error(`Alias not found by "${aliasOrId}" under ${chalk.bold(contextName)}`)
    output.log(`Run ${cmd('now alias ls')} to see your aliases.`)
    return 1;
  }

  const removeStamp = stamp()
  if (!opts['--yes'] && !(await confirmAliasRemove(output, alias))) {
    output.log('Aborted')
    return 0
  }

  await removeAliasById(now, alias.uid)
  console.log(`${chalk.cyan('> Success!')} Alias ${chalk.bold(alias.alias)} removed ${removeStamp()}`)
  return 0
}

async function confirmAliasRemove(output: Output, alias: Alias) {
  const srcUrl = alias.deployment ? chalk.underline(alias.deployment.url) : null
  const tbl = table([
    [ ...(srcUrl ? [srcUrl] : []),
      chalk.underline(alias.alias),
      chalk.gray(ms(new Date() - new Date(alias.created)) + ' ago')
    ]], {
    align: ['l', 'l', 'r'],
    hsep: ' '.repeat(4),
    stringLength: strlen
  })

  output.log(`The following alias will be removed permanently`)
  output.print(`  ${tbl}\n`)
  return promptBool(output, chalk.red('Are you sure?'))
}
