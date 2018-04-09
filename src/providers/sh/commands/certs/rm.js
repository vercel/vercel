// @flow
import chalk from 'chalk'
import ms from 'ms'
import table from 'text-table'

import Now from '../../util'
import getContextName from '../../util/get-context-name'
import stamp from '../../../../util/output/stamp'
import { CLIContext, Output } from '../../util/types'
import type { CLICertsOptions } from '../../util/types'

async function rm(ctx: CLIContext, opts: CLICertsOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const contextName = getContextName(sh);
  const { currentTeam } = sh;
  const { apiUrl } = ctx;
  const rmStamp = stamp()
  
  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam })

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now certs rm <id>`'
      )}`
    );
    now.close();
    return 1;
  }

  const id = args[0]
  const cert = await getCertById(now, id)

  if (!cert) {
    output.error(`No certificate found by id or cn "${id}" under ${chalk.bold(contextName)}`)
    now.close();
    return 1;
  }

  const yes = await readConfirmation(output, 'The following certificate will be removed permanently', cert)
  if (!yes) {
    output.error('User abort');
    now.close();
    return 0;
  }

  await deleteCertById(now, id)
  output.success(
    `Certificate ${chalk.bold(
      cert.cns.join(', ')
    )} ${chalk.gray(`(${id})`)} removed ${rmStamp()}`
  )
  return 0
}

function readConfirmation(output, msg, cert) {
  return new Promise(resolve => {
    const time = chalk.gray(ms(new Date() - new Date(cert.created)) + ' ago')
    
    output.log(msg)
    output.print(table([[cert.uid, chalk.bold(cert.cns.join(', ')), time]], {
      align: ['l', 'r', 'l'],
      hsep: ' '.repeat(6)
    }).replace(/^(.*)/gm, '  $1') + '\n')
    output.print(`${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`)

    process.stdin
      .on('data', d => {
        process.stdin.pause()
        resolve(d.toString().trim().toLowerCase() === 'y')
      })
      .resume()
  })
}

async function getCertById(now, id) {
  return (await getCerts(now)).filter(c => c.uid === id)[0]
}

async function getCerts(now) {
  const { certs } = await now.fetch('/v3/now/certs')
  return certs
}

async function deleteCertById(now, id) {
  return now.fetch(`/v3/now/certs/${id}`, {
    method: 'DELETE',
  })
}

export default rm
