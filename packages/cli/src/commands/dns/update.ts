import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import updateDNSRecord, {
  type UpdateDNSRecordData,
} from '../../util/dns/update-dns-record';
import { handleDNSRecordError } from '../../util/dns/error';
import { DnsUpdateTelemetryClient } from '../../util/telemetry/commands/dns/update';
import { updateSubcommand } from './command';

const SRV_FLAGS = [
  '--srv-priority',
  '--srv-weight',
  '--srv-port',
  '--srv-target',
] as const;

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DnsUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns update <id> [options]')}`
      )}`
    );
    return 1;
  }

  const [recordId] = args;

  telemetry.trackCliArgumentId(recordId);
  telemetry.trackCliOptionName(flags['--name']);
  telemetry.trackCliOptionType(flags['--type']);
  telemetry.trackCliOptionValue(flags['--value']);
  telemetry.trackCliOptionTtl(flags['--ttl']);
  telemetry.trackCliOptionMxPriority(flags['--mx-priority']);
  telemetry.trackCliOptionSrvPriority(flags['--srv-priority']);
  telemetry.trackCliOptionSrvWeight(flags['--srv-weight']);
  telemetry.trackCliOptionSrvPort(flags['--srv-port']);
  telemetry.trackCliOptionSrvTarget(flags['--srv-target']);
  telemetry.trackCliOptionComment(flags['--comment']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const numericFlags = [
    '--ttl',
    '--mx-priority',
    '--srv-priority',
    '--srv-weight',
    '--srv-port',
  ] as const;
  for (const flagName of numericFlags) {
    const value = flags[flagName];
    if (value !== undefined && Number.isNaN(value)) {
      output.error(`The ${flagName} option must be a number.`);
      return 1;
    }
  }

  const data: UpdateDNSRecordData = {};

  const name = flags['--name'];
  if (name !== undefined) {
    data.name = name === '@' ? '' : name;
  }
  if (flags['--type'] !== undefined) {
    data.type = flags['--type'];
  }
  if (flags['--value'] !== undefined) {
    data.value = flags['--value'];
  }
  if (flags['--ttl'] !== undefined) {
    data.ttl = flags['--ttl'];
  }
  if (flags['--mx-priority'] !== undefined) {
    data.mxPriority = flags['--mx-priority'];
  }
  if (flags['--comment'] !== undefined) {
    data.comment = flags['--comment'];
  }

  const srvFlagsProvided = SRV_FLAGS.filter(
    flagName => flags[flagName] !== undefined
  );
  if (srvFlagsProvided.length > 0) {
    if (srvFlagsProvided.length !== SRV_FLAGS.length) {
      output.error(
        `Updating an SRV record requires all of ${SRV_FLAGS.join(', ')}.`
      );
      return 1;
    }
    data.srv = {
      priority: flags['--srv-priority']!,
      weight: flags['--srv-weight']!,
      port: flags['--srv-port']!,
      target: flags['--srv-target']!,
    };
  }

  if (Object.keys(data).length === 0) {
    output.error(
      `Provide at least one field to update. See ${chalk.cyan(
        `${getCommandName('dns update --help')}`
      )} for available options.`
    );
    return 1;
  }

  const updateStamp = stamp();

  let record;
  try {
    record = await updateDNSRecord(client, recordId, data);
  } catch (err) {
    return handleDNSRecordError(err);
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return 0;
  }

  const { contextName } = await getScope(client);
  output.success(
    `DNS record ${chalk.gray(`${record.id}`)} of domain ${chalk.bold(
      record.domain
    )} updated under ${chalk.bold(contextName)} ${chalk.gray(updateStamp())}`
  );

  return 0;
}
