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
  // `available` is present only when the gateway annotated the response for a
  // restricted team. Show the column only then, so output for unauthenticated /
  // unrestricted listings is unchanged.
  const showAvailability = models.some(m => m.available !== undefined);

  const availabilityCell = (model: Model): string => {
    if (model.available === undefined) return chalk.gray('–');
    if (model.available) return chalk.green('yes');
    return model.unavailable_reason
      ? chalk.red(`no (${model.unavailable_reason})`)
      : chalk.red('no');
  };

  const headers = ['id', 'name', 'owner', 'type'];
  if (showAvailability) headers.push('available');
  const align = showAvailability
    ? (['l', 'l', 'l', 'l', 'l'] as const)
    : (['l', 'l', 'l', 'l'] as const);

  return `${table(
    [
      headers.map(header => chalk.gray(header)),
      ...models.map(model => {
        const row = [
          model.id,
          model.name ?? chalk.gray('–'),
          model.owned_by ?? chalk.gray('–'),
          model.type ?? chalk.gray('–'),
        ];
        if (showAvailability) row.push(availabilityCell(model));
        return row;
      }),
    ],
    { align: [...align], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
