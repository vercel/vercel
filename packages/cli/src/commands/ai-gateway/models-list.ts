import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listModels, type Model } from '../../util/ai-gateway/models';
import output from '../../output-manager';
import { AiGatewayModelsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/models-list';
import { modelsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

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

  return renderResource<Model[]>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching models',
    fetch: () => listModels(client),
    toJSON: models => ({ models }),
    isEmpty: models => models.length === 0,
    emptyMessage: 'No models found.',
    header: () => 'Models',
    renderTable: printModelsTable,
  });
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
