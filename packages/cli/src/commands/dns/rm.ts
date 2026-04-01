import chalk from 'chalk';
import ms from 'ms';
import table from '../../util/output/table';
import type { DNSRecord } from '@vercel-internals/types';
import type Client from '../../util/client';
import deleteDNSRecordById from '../../util/dns/delete-dns-record-by-id';
import getDNSRecordById from '../../util/dns/get-dns-record-by-id';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { DnsRmTelemetryClient } from '../../util/telemetry/commands/dns/rm';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithYes,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';

function withGlobalFlags(client: Client, commandTemplate: string): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

export default async function rm(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: err instanceof Error ? err.message : String(err),
        },
        1
      );
    }
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;
  const { telemetryEventStore } = client;
  const telemetry = new DnsRmTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });
  await getScope(client, { resolveLocalScope: true });

  const [recordId] = args;
  if (args.length !== 1) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(client, 'dns rm <id> --yes');
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          action: AGENT_ACTION.MISSING_ARGUMENTS,
          message: `Invalid number of arguments. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to remove a DNS record by id (use dns ls to find ids)',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns rm <id>')}`
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(recordId);
  telemetry.trackCliFlagYes(flags['--yes']);

  const record = await getDNSRecordById(client, recordId);

  if (!record) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.DNS_RECORD_NOT_FOUND,
          message: 'DNS record not found.',
          next: [
            {
              command: withGlobalFlags(client, 'dns ls'),
              when: 'to list DNS records and ids',
            },
          ],
        },
        1
      );
    }
    output.error('DNS record not found');
    return 1;
  }

  const { domain: domainName } = record;
  const skipConfirmation = flags['--yes'];

  if (client.nonInteractive && !skipConfirmation) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'In non-interactive mode --yes is required to remove a DNS record.',
        next: [
          {
            command: buildCommandWithYes(client.argv),
            when: 'to confirm removal',
          },
        ],
      },
      1
    );
    return 1;
  }

  const yes =
    skipConfirmation ||
    (await readConfirmation(
      client,
      'The following record will be removed permanently',
      domainName,
      record
    ));

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
