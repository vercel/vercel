// @flow
import chalk from 'chalk'
import ms from 'ms'
import plural from 'pluralize'
import table from 'text-table'

import Now from '../../util'
import getContextName from '../../util/get-context-name'
import getDNSRecords from '../../util/dns/get-dns-records'
import getDomainDNSRecords from '../../util/dns/get-domain-dns-records'
import indent from '../../util/indent'
import stamp from '../../../../util/output/stamp'
import strlen from '../../util/strlen'
import { CLIContext, Output } from '../../util/types'
import { DomainNotFound } from '../../util/errors'
import type { CLIDNSOptions, DNSRecord } from '../../util/types'

async function ls(ctx: CLIContext, opts: CLIDNSOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam })
  const [domainName] = args;
  const lsStamp = stamp()

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now dns ls [domain]`'
      )}`
    )
    return 1
  }

  if (domainName) {
    const records = await getDomainDNSRecords(output, now, domainName)
    if (records instanceof DomainNotFound) {
      output.error(`The domain ${domainName} can't be found under ${
        chalk.bold(contextName)
      } ${chalk.gray(lsStamp())}`)
      return 1
    }

    output.log(
      `${plural('Record', records.length, true)} found under ${
        chalk.bold(contextName)
      } ${chalk.gray(lsStamp())}`
    )
    console.log(`\n${chalk.bold(domainName)}`)
    console.log(`${indent(getDNSTable(domainName, records), 2)}`);
    return 0
  }

  const dnsRecords = await getDNSRecords(output, now, contextName);
  const nRecords = dnsRecords.reduce((p, r) => r.records.length + p, 0);
  output.log(
    `${plural('Record', nRecords, true)} found under ${
      chalk.bold(contextName)
    } ${chalk.gray(lsStamp())}`
  )

  dnsRecords.forEach(({domainName, records}) => {
    console.log(`\n${chalk.bold(domainName)}`)
    console.log(`${indent(getDNSTable(domainName, records), 2)}`);
  })
  return 0
}

function getDNSTable(domainName: string, records: DNSRecord[]): string {
  return table([
    ['', 'id', 'name', 'type', 'value', 'aux', 'created', ''].map(h => chalk.gray(h)),
    ...records.map(getDNSRow)
  ], {
    align: ['l', 'r', 'l', 'l', 'l', 'l', 'r'],
    hsep: ' '.repeat(2),
    stringLength: strlen
  }).replace(/^/gm, '  ')
}

function getDNSRow(record: DNSRecord) {
  const isSystemRecord = record.creator === 'system'
  const createdAt = ms(Date.now() - new Date(Number(record.created))) + ' ago'
  const priority = (record.mxPriority && record.mxPriority) || (record.priority && record.priority) || ''
  return [
    '',
    !isSystemRecord ? record.id : '',
    record.name,
    record.type,
    record.value,
    priority,
    !isSystemRecord ? chalk.gray(createdAt) : '',
    isSystemRecord ? 'default' : 'user'
  ]
}

export default ls
