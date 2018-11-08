// @flow
import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';

import Now from '../../util';
import getScope from '../../util/get-scope';
import deleteDNSRecordById from '../../util/dns/delete-dns-record-by-id';
import getDNSRecordById from '../../util/dns/get-dns-record-by-id';
import stamp from '../../util/output/stamp';
import { CLIContext, Output } from '../../util/types';
import type { CLIDNSOptions, DNSRecord } from '../../util/types';

async function rm(
  ctx: CLIContext,
  opts: CLIDNSOptions,
  args: string[],
  output: Output
): Promise<number> {
  // eslint-disable-line
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const [recordId] = args;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan('`now dns rm <id>`')}`
    );
    return 1;
  }

  const domainRecord = await getDNSRecordById(
    output,
    now,
    contextName,
    recordId
  );
  if (!domainRecord) {
    output.error('DNS record not found');
    return 1;
  }

  const { domainName, record } = domainRecord;
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
  await deleteDNSRecordById(output, now, contextName, domainName, record.id);
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
      table([getDeleteTableRow(domainName, record)], {
        align: ['l', 'r', 'l'],
        hsep: ' '.repeat(6)
      }).replace(/^(.*)/gm, '  $1') + '\n'
    );
    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    );
    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(
          d
            .toString()
            .trim()
            .toLowerCase() === 'y'
        );
      })
      .resume();
  });
}

function getDeleteTableRow(domainName: string, record: DNSRecord) {
  const recordName = `${record.name.length > 0
    ? record.name + '.'
    : ''}${domainName}`;
  return [
    record.id,
    chalk.bold(
      `${recordName} ${record.type} ${record.value} ${record.mxPriority || ''}`
    ),
    chalk.gray(ms(new Date() - new Date(Number(record.created))) + ' ago')
  ];
}

export default rm;
