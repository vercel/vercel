import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listModelEndpoints,
  type ModelEndpoint,
} from '../../util/ai-gateway/models';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayModelsEndpointsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/models-endpoints';
import { modelsEndpointsSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function endpoints(client: Client, argv: string[]) {
  const telemetry = new AiGatewayModelsEndpointsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    modelsEndpointsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts, args } = parsedArgs;

  const model = args[0];
  telemetry.trackCliArgumentModel(model);
  telemetry.trackCliOptionFormat(opts['--format']);

  if (!model) {
    output.error(
      `Specify a model, e.g. ${getCommandName('ai-gateway models endpoints anthropic/claude-opus-4.8')}.`
    );
    return 1;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const lsStamp = stamp();
  output.spinner(`Fetching endpoints for ${model}`);

  let data;
  try {
    data = await listModelEndpoints(client, model);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  const list = data?.endpoints ?? [];
  if (list.length === 0) {
    output.log(`No endpoints found for ${model}.`);
    return 0;
  }

  output.log(`Endpoints for ${data.id} ${lsStamp()}`);
  client.stdout.write(printEndpointsTable(list));
  return 0;
}

function printEndpointsTable(list: ModelEndpoint[]) {
  return `${table(
    [
      ['provider', 'context', 'input', 'output'].map(header =>
        chalk.gray(header)
      ),
      ...list.map(e => [
        e.provider_name,
        e.context_length != null ? String(e.context_length) : chalk.gray('–'),
        e.pricing?.prompt ?? chalk.gray('–'),
        e.pricing?.completion ?? chalk.gray('–'),
      ]),
    ],
    { align: ['l', 'r', 'r', 'r'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
