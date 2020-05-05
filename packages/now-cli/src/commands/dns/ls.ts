import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import { Output } from '../../util/output';
import { DomainNotFound } from '../../util/errors-ts';
import { ThenArg, DNSRecord, NowContext } from '../../types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getDNSRecords from '../../util/dns/get-dns-records';
import getDomainDNSRecords from '../../util/dns/get-domain-dns-records';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd';
import { getPkgName } from '../../util/pkg-name';

type DNSRecords = ThenArg<ReturnType<typeof getDNSRecords>>;

type Options = {
  '--debug': boolean;
  '--next'?: number;
};

export default async function ls(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const { '--debug': debug, '--next': nextTimestamp } = opts;
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const [domainName] = args;
  const lsStamp = stamp();

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getPkgName()} dns ls [domain]`
      )}`
    );
    return 1;
  }

  if (typeof nextTimestamp !== 'undefined' && Number.isNaN(nextTimestamp)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

  if (domainName) {
    const data = await getDomainDNSRecords(
      output,
      client,
      domainName,
      nextTimestamp,
      4
    );
    if (data instanceof DomainNotFound) {
      output.error(
        `The domain ${domainName} can't be found under ${chalk.bold(
          contextName
        )} ${chalk.gray(lsStamp())}`
      );
      return 1;
    }

    const { records, pagination } = data;

    output.log(
      `${
        records.length > 0 ? 'Records' : 'No records'
      } found under ${chalk.bold(contextName)} ${chalk.gray(lsStamp())}`
    );
    console.log(getDNSRecordsTable([{ domainName, records }]));

    if (pagination && pagination.count === 20) {
      const flags = getCommandFlags(opts, ['_', '--next']);
      output.log(
        `To display the next page run ${cmd(
          `${getPkgName()} dns ls ${domainName}${flags} --next ${
            pagination.next
          }`
        )}`
      );
    }

    return 0;
  }

  const dnsRecords = await getDNSRecords(output, client, contextName);
  const nRecords = dnsRecords.reduce((p, r) => r.records.length + p, 0);
  output.log(
    `${plural('Record', nRecords, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );
  console.log(getDNSRecordsTable(dnsRecords));
  return 0;
}

function getDNSRecordsTable(dnsRecords: DNSRecords) {
  return formatTable(
    ['', 'id', 'name', 'type', 'value', 'created'],
    ['l', 'r', 'l', 'l', 'l', 'l'],
    dnsRecords.map(({ domainName, records }) => ({
      name: chalk.bold(domainName),
      rows: records.map(getDNSRecordRow),
    }))
  );
}

function getDNSRecordRow(record: DNSRecord) {
  const isSystemRecord = record.creator === 'system';
  const createdAt = `${ms(
    Date.now() - new Date(Number(record.created)).getTime()
  )} ago`;
  const priority = record.mxPriority || record.priority || null;
  return [
    '',
    !isSystemRecord ? record.id : '',
    record.name,
    record.type,
    priority ? `${priority} ${record.value}` : record.value,
    chalk.gray(isSystemRecord ? 'default' : createdAt),
  ];
}
