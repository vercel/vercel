// @flow
import chalk from 'chalk'
import ms from 'ms'
import plural from 'pluralize'
import table from 'text-table'

import { CLIContext, Output } from '../../util/types'
import getContextName from '../../util/get-context-name'
import getDomains from '../../util/domains/get-domains'
import Now from '../../util'
import stamp from '../../../../util/output/stamp'
import strlen from '../../util/strlen'
import type { CLIDomainsOptions, Domain } from '../../util/types'

async function ls(ctx: CLIContext, opts: CLIDomainsOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam })
  const lsStamp = stamp()

  if (args.length !== 0) {
    output.error(`Invalid number of arguments. Usage: ${chalk.cyan('`now domains ls`')}`)
    return 1;
  }

  const domains = await getDomains(output, now, contextName);
  output.log(`${plural('domain', domains.length, true)} found under ${chalk.bold(contextName)} ${chalk.gray(lsStamp())}\n`)
  if (domains.length > 0) {
    console.log(formatDomainsTable(domains))
  }

  return 0;
}

function formatDomainsTable(domains: Domain[]) {
  const current = new Date();
  return table(
    [
      ['', 'domain', 'dns', 'verified', 'cdn', 'age'].map(s => chalk.dim(s)),
      ...domains.map(domain => {
        const cdnEnabled = domain.cdnEnabled || false
        const ns = domain.isExternal ? 'external' : 'zeit.world'
        const url = chalk.bold(domain.name)
        const time = chalk.gray(
          ms(current - new Date(domain.created))
        )
        return ['', url, ns, domain.verified, cdnEnabled, time]
      })
    ],
    {
      align: ['l', 'l', 'l', 'l', 'l'],
      hsep: ' '.repeat(2),
      stringLength: strlen
    }
  )
}

export default ls;
