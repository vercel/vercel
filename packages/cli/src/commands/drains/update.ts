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
import getDrainById from '../../util/drains/get-drain-by-id';
import updateDrain from '../../util/drains/update-drain';
import { redactDrainForJson } from '../../util/drains/format';
import { handleDrainsError } from '../../util/drains/error';
import type {
  DrainDeliveryHttp,
  DrainSchemaName,
  UpdateDrainRequestBody,
} from '../../util/drains/types';
import { updateSubcommand } from './command';
import {
  DRAIN_COMPRESSIONS,
  DRAIN_ENCODINGS,
  SAMPLING_ENVIRONMENTS,
  buildSamplingRules,
  isDrainCompression,
  isDrainEncoding,
  isSamplingEnvironment,
  parseHeaderFlags,
  validateEndpointUrl,
  validateSamplingRate,
} from './flags';

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
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
  const { flags } = parsedArgs;

  const id = parsedArgs.args[0];
  if (!id) {
    output.error(
      `Please provide a drain id. See ${getCommandName('drains update <id>')}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(id);
  telemetry.trackCliOptionName(flags['--name']);
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

  const name = flags['--name'];
  const endpoint = flags['--endpoint'];
  const encoding = flags['--encoding'];
  const compression = flags['--compression'];
  const headerFlags = flags['--header'];
  const secret = flags['--secret'];
  const projectIds = flags['--project'];
  const sampling = flags['--sampling'];
  const environment = flags['--environment'];

  const hasDeliveryChange =
    endpoint !== undefined ||
    encoding !== undefined ||
    compression !== undefined ||
    (headerFlags !== undefined && headerFlags.length > 0) ||
    secret !== undefined;
  const hasChange =
    hasDeliveryChange ||
    name !== undefined ||
    (projectIds !== undefined && projectIds.length > 0) ||
    sampling !== undefined;

  if (!hasChange) {
    output.error(
      `Provide at least one flag to update, e.g. --name or --endpoint. See ${getCommandName('drains update --help')}.`
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
  if (encoding !== undefined && !isDrainEncoding(encoding)) {
    output.error(
      `Invalid --encoding value: "${encoding}". Valid encodings: ${DRAIN_ENCODINGS.join(', ')}.`
    );
    return 1;
  }
  if (compression !== undefined && !isDrainCompression(compression)) {
    output.error(
      `Invalid --compression value: "${compression}". Valid values: ${DRAIN_COMPRESSIONS.join(', ')}.`
    );
    return 1;
  }
  if (environment !== undefined && !isSamplingEnvironment(environment)) {
    output.error(
      `Invalid --environment value: "${environment}". Valid environments: ${SAMPLING_ENVIRONMENTS.join(', ')}.`
    );
    return 1;
  }
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
  const parsedHeaders = parseHeaderFlags(headerFlags ?? []);
  if (!parsedHeaders.ok) {
    output.error(parsedHeaders.error);
    return 1;
  }

  // Fetch the current drain: delivery is replaced wholesale by PATCH, so
  // partial delivery edits must be merged with the existing configuration.
  let drain;
  try {
    drain = await getDrainById(client, id);
  } catch (err) {
    return handleDrainsError(err);
  }

  const body: UpdateDrainRequestBody = {};

  if (name !== undefined) {
    body.name = name;
  }
  if (projectIds !== undefined && projectIds.length > 0) {
    body.projects = 'some';
    body.projectIds = projectIds;
  }
  if (sampling !== undefined) {
    const [schemaName] = Object.keys(drain.schemas ?? {}) as DrainSchemaName[];
    body.sampling = buildSamplingRules(
      schemaName ?? 'log',
      sampling,
      environment
    );
  }

  if (hasDeliveryChange) {
    if (drain.delivery.type !== 'http') {
      output.error(
        `Can't update delivery settings of a ${drain.delivery.type} drain from the CLI. Only HTTP drains are supported.`
      );
      return 1;
    }
    const current = drain.delivery;
    const delivery: DrainDeliveryHttp = {
      type: 'http',
      endpoint: endpoint ?? current.endpoint,
      encoding: encoding ?? current.encoding,
      headers:
        headerFlags !== undefined && headerFlags.length > 0
          ? parsedHeaders.headers
          : current.headers,
    };
    const mergedCompression = compression ?? current.compression;
    if (mergedCompression !== undefined) {
      delivery.compression = mergedCompression;
    }
    // Preserve an existing string secret; integration-managed secrets
    // (placeholder objects) can't be re-sent and are omitted.
    const mergedSecret =
      secret ??
      (typeof current.secret === 'string' ? current.secret : undefined);
    if (mergedSecret !== undefined) {
      delivery.secret = mergedSecret;
    }
    body.delivery = delivery;
  }

  const updateStamp = stamp();
  let updated;
  try {
    updated = await updateDrain(client, id, body);
  } catch (err) {
    return handleDrainsError(err);
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(redactDrainForJson(updated), null, 2)}\n`
    );
    return 0;
  }

  output.success(
    `Drain ${chalk.gray(id)} updated ${chalk.gray(updateStamp())}`
  );
  return 0;
}
