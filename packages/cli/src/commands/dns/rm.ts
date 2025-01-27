import chalk from 'chalk';
import ms from 'ms';
import table from '../../util/output/table';
import type { DNSRecord } from '@vercel-internals/types';
import type Client from '../../util/client';
import deleteDNSRecordById from '../../util/dns/delete-dns-record-by-id';
import getDNSRecordById from '../../util/dns/get-dns-record-by-id';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DnsRmTelemetryClient } from '../../util/telemetry/commands/dns/rm';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function rm(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification, { permissive: true });
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args } = parsedArgs;
  const { telemetryEventStore } = client;
  const telemetry = new DnsRmTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });
  await getScope(client);

  const [recordId] = args;
  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns rm <id>')}`
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(recordId);

  const record = await getDNSRecordById(client, recordId);

  if (!record) {
    output.error('DNS record not found');
    return 1;
  }

  const { domain: domainName } = record;
  const yes = await readConfirmation(
    client,
    'The following record will be removed permanently',
    domainName,
    record
  );

  if (!yes) {
    output.error(`User canceled.`);
    return 0;
  }

  const rmStamp = stamp();
  await deleteDNSRecordById(client, domainName, record.id);
  output.success(
    `Record ${chalk.gray(`${record.id}`)} removed ${chalk.gray(rmStamp())}`
  );
  return 0;
}

function readConfirmation(
  client: Client,
  msg: string,
  domainName: string,
  record: DNSRecord
) {
  return new Promise(resolve => {
    output.log(msg);
    output.print(
      `${table([getDeleteTableRow(domainName, record)], {
        align: ['l', 'r', 'l'],
        hsep: 6,
      }).replace(/^(.*)/gm, '  $1')}\n`
    );
    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('(y/N) ')}`
    );
    client.stdin
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
