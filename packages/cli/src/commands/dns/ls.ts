import chalk from 'chalk';
import ms from 'ms';
import { DomainNotFound } from '../../util/errors-ts';
import type { DNSRecord } from '@vercel-internals/types';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import getDNSRecords, {
  type DomainRecordsItem,
} from '../../util/dns/get-dns-records';
import getDomainDNSRecords from '../../util/dns/get-domain-dns-records';
import getScope from '../../util/get-scope';
import { getPaginationOpts } from '../../util/get-pagination-opts';
import stamp from '../../util/output/stamp';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DnsLsTelemetryClient } from '../../util/telemetry/commands/dns/ls';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateLsArgs } from '../../util/validate-ls-args';
import {
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import { getCommandNamePlain } from '../../util/pkg-name';

export default async function ls(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
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
  const { args, flags: opts } = parsedArgs;

  if (client.nonInteractive && args.length > 1) {
    const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
    const cmd = getCommandNamePlain(
      `dns ls <domain> ${flags.join(' ')}`.trim()
    );
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
            when: 'to list DNS records (optional single domain)',
          },
        ],
      },
      1
    );
    return 1;
  }

  const validationResult = validateLsArgs({
    commandName: 'dns ls <domain>',
    args: args,
    maxArgs: 1,
    exitCode: 1,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  const { telemetryEventStore } = client;
  const { contextName } = await getScope(client, {
    resolveLocalScope: true,
  });
  const telemetry = new DnsLsTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const [domainName] = args;
  const lsStamp = stamp();

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);

  let paginationOptions;

  try {
    paginationOptions = getPaginationOpts(opts);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }

  if (domainName) {
    const data = await getDomainDNSRecords(
      client,
      domainName,
      4,
      ...paginationOptions
    );
    if (data instanceof DomainNotFound) {
      if (client.nonInteractive) {
        const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
        const cmd = getCommandNamePlain(`dns ls ${flags.join(' ')}`.trim());
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.DOMAIN_NOT_FOUND,
            message: `The domain ${domainName} can't be found under ${contextName}.`,
            next: [{ command: cmd, when: 'to list available DNS records' }],
          },
          1
        );
      }
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
    client.stdout.write(getDNSRecordsTable([{ domainName, records }]));

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
    client,
    contextName,
    ...paginationOptions
  );
  const nRecords = dnsRecords.reduce((p, r) => r.records.length + p, 0);
  output.log(
    `${nRecords > 0 ? 'Records' : 'No records'} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );
  output.log(getDNSRecordsTable(dnsRecords));
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
