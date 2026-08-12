import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import formatDate from '../../util/format-date';
import table from '../../util/output/table';
import { DomainNotFound } from '../../util/errors-ts';
import findDNSRecordById, {
  type DetailedDNSRecord,
} from '../../util/dns/find-dns-record-by-id';
import { handleDNSRecordError } from '../../util/dns/error';
import { DnsInspectTelemetryClient } from '../../util/telemetry/commands/dns/inspect';
import { inspectSubcommand } from './command';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DnsInspectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length !== 2) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns inspect <domain> <id>')}`
      )}`
    );
    return 1;
  }

  const [domainName, recordId] = args;

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliArgumentId(recordId);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const { contextName } = await getScope(client);

  let record;
  try {
    record = await findDNSRecordById(client, domainName, recordId);
  } catch (err) {
    return handleDNSRecordError(err);
  }

  if (record instanceof DomainNotFound) {
    output.error(
      `The domain ${domainName} can't be found under ${chalk.bold(contextName)}.`
    );
    return 1;
  }

  if (!record) {
    output.error('DNS record not found');
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return 0;
  }

  output.log(
    `DNS record ${chalk.bold(record.id)} of domain ${chalk.bold(
      domainName
    )} under ${chalk.bold(contextName)}`
  );
  client.stdout.write(formatRecordDetails(domainName, record));

  return 0;
}

function formatRecordDetails(
  domainName: string,
  record: DetailedDNSRecord
): string {
  const rows: string[][] = [
    ['ID', record.id],
    ['Name', record.name || '@'],
    ['Domain', domainName],
    ['Type', record.type],
    ['Value', record.value],
  ];

  if (record.ttl !== undefined) {
    rows.push(['TTL', `${record.ttl}`]);
  }

  const priority = record.mxPriority ?? record.priority;
  if (priority !== undefined) {
    rows.push(['Priority', `${priority}`]);
  }

  if (record.comment) {
    rows.push(['Comment', record.comment]);
  }

  rows.push(['Creator', record.creator]);
  rows.push(['Created', formatDate(record.createdAt)]);
  rows.push(['Updated', formatDate(record.updatedAt)]);

  return `${table(rows, { align: ['l', 'l'], hsep: 2 }).replace(/^(.*)/gm, '  $1')}\n`;
}
