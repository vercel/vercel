// @flow
import chalk from 'chalk'
import Now from '../../util'
import getContextName from '../../util/get-context-name'
import stamp from '../../../../util/output/stamp'
import addDNSRecord from '../../util/dns/add-dns-record'
import { DomainNotFound, DNSPermissionDenied } from '../../util/errors'
import { CLIContext, Output } from '../../util/types'
import type { CLIDNSOptions } from '../../util/types'

async function add(ctx: CLIContext, opts: CLIDNSOptions, args: string[], output: Output): Promise<number> { // eslint-disable-line
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam })

  const parsedParams = parseAddArgs(args)
  if (!parsedParams) {
    output.error(
      `Invalid number of arguments. See: ${chalk.cyan(
        '`now dns --help`'
      )} for usage.`
    )
    return 1
  }

  const addStamp = stamp()
  const {domain, data} = parsedParams
  const record = await addDNSRecord(output, now, domain, data)
  if (record instanceof DomainNotFound) {
    output.error(`The domain ${domain} can't be found under ${
      chalk.bold(contextName)
    } ${chalk.gray(addStamp())}`)
    return 1
  } else if (record instanceof DNSPermissionDenied) {
    output.error(`You don't have permissions to add records to domain ${domain} under ${
      chalk.bold(contextName)
    } ${chalk.gray(addStamp())}`)
    return 1
  } else {
    console.log(
      `${chalk.cyan('> Success!')} DNS record for domain ${chalk.bold(
        domain
      )} ${chalk.gray(`(${record.uid})`)} created under ${
        chalk.bold(contextName)
      } ${chalk.gray(addStamp())}`
    )
  }

  return 0;
}

function parseAddArgs(args: string[]) {
  if (!args || args.length < 4) {
    return null
  }

  const domain = args[0]
  const name = args[1] === '@' ? '' : args[1].toString()
  const type = args[2]
  const value = args[3]

  if (!(domain && typeof name === 'string' && type)) {
    return null
  } else if (type === 'MX' && args.length === 5) {
    return {
      domain,
      data: { name, type, value, mxPriority: Number(args[4]) }
    }
  } else if (type === 'SRV' && args.length === 7) {
    return {
      domain,
      data: {
        name,
        type,
        srv: {
          priority: Number(value),
          weight: Number(args[4]),
          port: Number(args[5]),
          target: args[6]
        }
      }
    }
  } else if (args.length === 4) {
    return {
      domain,
      data: {
        name,
        type,
        value
      }
    }
  }

  return null;
}

export default add
