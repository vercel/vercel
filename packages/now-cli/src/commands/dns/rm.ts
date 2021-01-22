import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import { NowContext, DNSRecord } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import deleteDNSRecordById from '../../util/dns/delete-dns-record-by-id';
import getDNSRecordById from '../../util/dns/get-dns-record-by-id';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
};

export default async function rm(
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
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug, output });

  try {
    await getScope(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const [recordId] = args;
  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns rm <id>')}`
      )}`
    );
    return 1;
  }

  const record = await getDNSRecordById(client, recordId);

  if (!record) {
    output.error('DNS record not found');
    return 1;
  }

  const { domain: domainName } = record;
  const yes = await readConfirmation(
    output,
    'The following record will be removed permanently',
    domainName,
    record
  );

  if (!yes) {
    output.error(`User aborted.`);
    return 0;
  }

  const rmStamp = stamp();
  await deleteDNSRecordById(client, domainName, record.id);
  console.log(
    `${chalk.cyan('> Success!')} Record ${chalk.gray(
      `${record.id}`
    )} removed ${chalk.gray(rmStamp())}`
  );
  return 0;
}

function readConfirmation(
  output: Output,
  msg: string,
  domainName: string,
  record: DNSRecord
) {
  return new Promise(resolve => {
    output.log(msg);
    output.print(
      `${table([getDeleteTableRow(domainName, record)], {
        align: ['l', 'r', 'l'],
        hsep: ' '.repeat(6),
      }).replace(/^(.*)/gm, '  $1')}\n`
    );
    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    );
    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(d.toString().trim().toLowerCase() === 'y');
      })
      .resume();
  });
}

function getDeleteTableRow(domainName: string, record: DNSRecord) {
  const recordName = `${
    record.name.length > 0 ? `${record.name}.` : ''
  }${domainName}`;
  return [
    record.id,
    chalk.bold(
      `${recordName} ${record.type} ${record.value} ${record.mxPriority || ''}`
    ),
    chalk.gray(
      `${ms(Date.now() - new Date(Number(record.createdAt)).getTime())} ago`
    ),
  ];
}
