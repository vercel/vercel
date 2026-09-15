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
import getDNSRecordById, {
  type DetailedDNSRecord,
} from '../../util/dns/get-dns-record-by-id';
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

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns inspect <id>')}`
      )}`
    );
    return 1;
  }

  const [recordId] = args;

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
    record = await getDNSRecordById(client, recordId);
  } catch (err) {
    return handleDNSRecordError(err);
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
      record.domain
    )} under ${chalk.bold(contextName)}`
  );
  client.stdout.write(formatRecordDetails(record));

  return 0;
}

function formatRecordDetails(record: DetailedDNSRecord): string {
  const rows: string[][] = [
    ['ID', record.id],
    ['Name', record.name || '@'],
    ['Domain', record.domain],
    ['Type', record.type],
    ['Value', record.value],
  ];

  const priority = record.priority ?? record.mxPriority;
  if (priority !== undefined) {
    rows.push(['Priority', `${priority}`]);
  }

  if (record.ttl !== undefined) {
    rows.push(['TTL', `${record.ttl}`]);
  }

  if (record.comment) {
    rows.push(['Comment', record.comment]);
  }

  rows.push(['Creator', record.creator]);
  rows.push(['Created', formatDate(record.createdAt)]);

  if (record.updatedAt) {
    rows.push(['Updated', formatDate(record.updatedAt)]);
  }

  return `${table(rows, { align: ['l', 'l'], hsep: 2 }).replace(/^(.*)/gm, '  $1')}\n`;
}
