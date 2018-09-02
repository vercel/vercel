// @flow
import {parse} from 'psl'
import chalk from 'chalk'

import { CLIContext, Output } from '../../util/types'
import dnsTable from '../../util/dns-table'
import getCnsFromArgs from '../../util/certs/get-cns-from-args'
import getContextName from '../../util/get-context-name'
import Now from '../../util'
import stamp from '../../../../util/output/stamp'
import startCertOrder from '../../util/certs/start-cert-order'
import type { CLICertsOptions } from '../../util/types'

async function start(ctx: CLIContext, opts: CLICertsOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const { apiUrl } = ctx;
  const contextName = getContextName(sh);
  const addStamp = stamp()

  const {
    ['--debug']: debugEnabled,
  } = opts;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })

  if (args.length < 1) {
    output.error(`Invalid number of arguments to create a certificate order. Usage:`)
    output.print(`  ${chalk.cyan(`now certs start <cn>[, <cn>]`)}\n`)
    now.close();
    return 1
  }

  const cns = getCnsFromArgs(args)
  const {challengesToResolve} = await startCertOrder(now, cns, contextName)
  const pendingChallenges = challengesToResolve.filter(challenge => challenge.status === 'pending')

  // When there are no pending challenges we just tell you can submit
  if (pendingChallenges.length === 0) {
    output.success(`A certificate order ${chalk.bold(cns.join(', '))} has been created ${addStamp()}`)
    output.print(`  There are no pending challenges so you can now finish the order by running: \n`)
    output.print(`  ${chalk.cyan(`now certs finish ${cns.join(' ')}`)}\n`)
    return 0;
  }

  output.success(`A certificate order ${chalk.bold(cns.join(', '))} has been created ${addStamp()}`)
  output.print(`  You may add now the following TXT records to solve the DNS challenge:\n\n`)
  const [header, ...rows] = dnsTable(pendingChallenges.map((challenge) => ([
    parse(challenge.domain).subdomain ? `_acme-challenge.${parse(challenge.domain).subdomain}` : `_acme-challenge`,
    'TXT',
    challenge.value
  ]))).split('\n');

  output.print(header + '\n');
  process.stdout.write(rows.join('\n') + '\n')
  return 0
}

export default start
