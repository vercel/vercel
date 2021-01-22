import chalk from 'chalk';
import ms from 'ms';
import { DomainNotFound } from '../../util/errors-ts';
import { DNSRecord, NowContext } from '../../types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getDNSRecords, {
  DomainRecordsItem,
} from '../../util/dns/get-dns-records';
import getDomainDNSRecords from '../../util/dns/get-domain-dns-records';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
  '--next'?: number;
};

export default async function ls(
  ctx: NowContext,
  opts: Options,
  args: string[]
) {
  const {
    apiUrl,
    authConfig: { token },
    output,
    config,
  } = ctx;
  const { currentTeam } = config;
  const { '--debug': debug, '--next': nextTimestamp } = opts;
  const client = new Client({ apiUrl, token, currentTeam, debug, output });
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
        `${getCommandName('dns ls [domain]')}`
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
        `To display the next page run ${getCommandName(
          `dns ls ${domainName}${flags} --next ${pagination.next}`
        )}`
      );
    }

    return 0;
  }

  const { records: dnsRecords, pagination } = await getDNSRecords(
    output,
    client,
    contextName,
    nextTimestamp
  );
  const nRecords = dnsRecords.reduce((p, r) => r.records.length + p, 0);
  output.log(
    `${nRecords > 0 ? 'Records' : 'No records'} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );
  console.log(getDNSRecordsTable(dnsRecords));
  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page run ${getCommandName(
        `dns ls${flags} --next ${pagination.next}`
      )}`
    );
  }
  return 0;
}

function getDNSRecordsTable(dnsRecords: DomainRecordsItem[]) {
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
    Date.now() - new Date(Number(record.createdAt)).getTime()
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
