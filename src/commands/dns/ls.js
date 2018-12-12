import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import Now from '../../util';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import getDNSRecords from '../../util/dns/get-dns-records';
import getDomainDNSRecords from '../../util/dns/get-domain-dns-records';
import stamp from '../../util/output/stamp.ts';
import formatTable from '../../util/format-table';
import { DomainNotFound } from '../../util/errors-ts';

async function ls(ctx, opts, args, output) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const [domainName] = args;
  const lsStamp = stamp();

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now dns ls [domain]`'
      )}`
    );
    return 1;
  }

  if (domainName) {
    const records = await getDomainDNSRecords(output, now, domainName);
    if (records instanceof DomainNotFound) {
      output.error(
        `The domain ${domainName} can't be found under ${chalk.bold(
          contextName
        )} ${chalk.gray(lsStamp())}`
      );
      return 1;
    }

    output.log(
      `${plural('Record', records.length, true)} found under ${chalk.bold(
        contextName
      )} ${chalk.gray(lsStamp())}`
    );
    console.log(getDNSRecordsTable([{ domainName, records }]));
    return 0;
  }

  const dnsRecords = await getDNSRecords(output, now, contextName);
  const nRecords = dnsRecords.reduce((p, r) => r.records.length + p, 0);
  output.log(
    `${plural('Record', nRecords, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );
  console.log(getDNSRecordsTable(dnsRecords));
  return 0;
}

function getDNSRecordsTable(dnsRecords) {
  return formatTable(
    ['', 'id', 'name', 'type', 'value', 'created'],
    ['l', 'r', 'l', 'l', 'l', 'l'],
    dnsRecords.map(({ domainName, records }) => ({
      name: chalk.bold(domainName),
      rows: records.map(record => getDNSRecordRow(domainName, record))
    }))
  );
}

function getDNSRecordRow(domainName, record) {
  const isSystemRecord = record.creator === 'system';
  const createdAt = `${ms(Date.now() - new Date(Number(record.created)))} ago`;
  const priority = record.mxPriority || record.priority || null;
  return [
    '',
    !isSystemRecord ? record.id : '',
    record.name,
    record.type,
    priority ? `${priority} ${record.value}` : record.value,
    chalk.gray(isSystemRecord ? 'default' : createdAt)
  ];
}

export default ls;
