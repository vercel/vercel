import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import createDrain from '../../util/drains/create-drain';
import { redactDrainForJson } from '../../util/drains/format';
import { handleDrainsError } from '../../util/drains/error';
import type {
  CreateDrainRequestBody,
  DrainDeliveryHttp,
  DrainSchemaName,
} from '../../util/drains/types';
import { addSubcommand } from './command';
import {
  DRAIN_COMPRESSIONS,
  DRAIN_ENCODINGS,
  DRAIN_SCHEMA_NAMES,
  SAMPLING_ENVIRONMENTS,
  buildSamplingRules,
  isDrainCompression,
  isDrainEncoding,
  isDrainSchemaName,
  isSamplingEnvironment,
  parseHeaderFlags,
  validateEndpointUrl,
  validateSamplingRate,
} from './flags';

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  telemetry.trackCliOptionName(flags['--name']);
  telemetry.trackCliOptionType(flags['--type']);
  telemetry.trackCliOptionEndpoint(flags['--endpoint']);
  telemetry.trackCliOptionEncoding(flags['--encoding']);
  telemetry.trackCliOptionCompression(flags['--compression']);
  telemetry.trackCliOptionHeader(flags['--header']);
  telemetry.trackCliOptionSecret(flags['--secret']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliOptionSampling(flags['--sampling']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const interactive = client.stdin.isTTY && !client.nonInteractive;

  let name = flags['--name'];
  let type = flags['--type'];
  let endpoint = flags['--endpoint'];

  if (type !== undefined && !isDrainSchemaName(type)) {
    output.error(
      `Invalid --type value: "${type}". Valid types: ${DRAIN_SCHEMA_NAMES.join(', ')}.`
    );
    return 1;
  }
  if (endpoint !== undefined) {
    const endpointError = validateEndpointUrl(endpoint);
    if (endpointError) {
      output.error(endpointError);
      return 1;
    }
  }
  const encoding = flags['--encoding'] ?? 'json';
  if (!isDrainEncoding(encoding)) {
    output.error(
      `Invalid --encoding value: "${encoding}". Valid encodings: ${DRAIN_ENCODINGS.join(', ')}.`
    );
    return 1;
  }
  const compression = flags['--compression'];
  if (compression !== undefined && !isDrainCompression(compression)) {
    output.error(
      `Invalid --compression value: "${compression}". Valid values: ${DRAIN_COMPRESSIONS.join(', ')}.`
    );
    return 1;
  }
  const environment = flags['--environment'];
  if (environment !== undefined && !isSamplingEnvironment(environment)) {
    output.error(
      `Invalid --environment value: "${environment}". Valid environments: ${SAMPLING_ENVIRONMENTS.join(', ')}.`
    );
    return 1;
  }
  const sampling = flags['--sampling'];
  if (sampling !== undefined) {
    const samplingError = validateSamplingRate(sampling);
    if (samplingError) {
      output.error(samplingError);
      return 1;
    }
  }
  if (environment !== undefined && sampling === undefined) {
    output.error('The --environment flag requires --sampling.');
    return 1;
  }
  const parsedHeaders = parseHeaderFlags(flags['--header'] ?? []);
  if (!parsedHeaders.ok) {
    output.error(parsedHeaders.error);
    return 1;
  }

  if (!name || !type || !endpoint) {
    if (!interactive) {
      const missing = [
        !name && '--name',
        !type && '--type',
        !endpoint && '--endpoint',
      ]
        .filter(Boolean)
        .join(', ');
      output.error(
        `Missing required flags: ${missing}. See ${getCommandName('drains add --help')}.`
      );
      return 1;
    }

    if (!name) {
      name = await client.input.text({
        message: 'Name?',
        validate: value => (value.trim().length > 0 ? true : 'Enter a name'),
      });
      name = name.trim();
    }
    if (!type) {
      type = await client.input.select<DrainSchemaName>({
        message: 'Data type?',
        choices: DRAIN_SCHEMA_NAMES.map(schemaName => ({
          name: schemaName,
          value: schemaName,
        })),
      });
    }
    if (!endpoint) {
      endpoint = await client.input.text({
        message: 'Endpoint URL?',
        validate: value => validateEndpointUrl(value) ?? true,
      });
    }
  }

  const schemaName = type as DrainSchemaName;

  const delivery: DrainDeliveryHttp = {
    type: 'http',
    endpoint,
    encoding,
    headers: parsedHeaders.headers,
  };
  if (compression !== undefined) {
    delivery.compression = compression;
  }
  const secret = flags['--secret'];
  if (secret !== undefined) {
    delivery.secret = secret;
  }

  const projectIds = flags['--project'];
  const body: CreateDrainRequestBody = {
    name,
    projects: projectIds && projectIds.length > 0 ? 'some' : 'all',
    schemas: { [schemaName]: { version: 'v1' } },
    delivery,
  };
  if (projectIds && projectIds.length > 0) {
    body.projectIds = projectIds;
  }
  if (sampling !== undefined) {
    body.sampling = buildSamplingRules(schemaName, sampling, environment);
  }

  const addStamp = stamp();
  let drain;
  try {
    drain = await createDrain(client, body);
  } catch (err) {
    return handleDrainsError(err);
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(redactDrainForJson(drain), null, 2)}\n`
    );
    return 0;
  }

  output.success(
    `Drain ${chalk.bold(drain.name)} created (${drain.id}) ${chalk.gray(addStamp())}`
  );
  return 0;
}
