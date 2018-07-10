// @flow
import chalk from 'chalk'
import ms from 'ms'
import plural from 'pluralize'

import Now from '../../util'
import getContextName from '../../util/get-context-name'
import getDNSRecords from '../../util/dns/get-dns-records'
import getDomainDNSRecords from '../../util/dns/get-domain-dns-records'
import stamp from '../../../../util/output/stamp'
import formatTable from '../../util/format-table'
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
    console.log(getDNSRecordsTable([{domainName, records}]))
    return 0
  }

  const dnsRecords = await getDNSRecords(output, now, contextName);
  const nRecords = dnsRecords.reduce((p, r) => r.records.length + p, 0);
  output.log(
    `${plural('Record', nRecords, true)} found under ${
      chalk.bold(contextName)
    } ${chalk.gray(lsStamp())}`
  )
  console.log(getDNSRecordsTable(dnsRecords))
  return 0
}

function getDNSRecordsTable(dnsRecords: Array<{domainName: string, records: DNSRecord[]}>): string {
  return formatTable(
    ['', 'id', 'name', 'type', 'value', 'created'],
    ['l', 'r', 'l', 'l', 'l', 'l'],
    dnsRecords.map(({domainName, records}) => ({
      name: chalk.bold(domainName),
      rows: records.map(record => getDNSRecordRow(domainName, record))
    }))
  )
}

function getDNSRecordRow(domainName: string, record: DNSRecord) {
  const isSystemRecord = record.creator === 'system'
  const createdAt = ms(Date.now() - new Date(Number(record.created))) + ' ago'
  const priority = record.mxPriority || record.priority || null
  return [
    '',
    !isSystemRecord ? record.id : '',
    record.name,
    record.type,
    priority ? `${priority} ${record.value}` : record.value,
    chalk.gray(isSystemRecord  ? 'default' : createdAt),
  ]
}

export default ls
