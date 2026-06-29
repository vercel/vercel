import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listModels, type Model } from '../../util/ai-gateway/models';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayModelsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/models-list';
import { modelsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayModelsListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    modelsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const lsStamp = stamp();
  output.spinner('Fetching models');

  let models: Model[];
  try {
    models = await listModels(client);
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
    client.stdout.write(`${JSON.stringify({ models }, null, 2)}\n`);
    return 0;
  }

  if (models.length === 0) {
    output.log('No models found.');
    return 0;
  }

  output.log(`Models ${lsStamp()}`);
  client.stdout.write(printModelsTable(models));
  return 0;
}

function printModelsTable(models: Model[]) {
  return `${table(
    [
      ['id', 'name', 'owner', 'type'].map(header => chalk.gray(header)),
      ...models.map(model => [
        model.id,
        model.name ?? chalk.gray('–'),
        model.owned_by ?? chalk.gray('–'),
        model.type ?? chalk.gray('–'),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
