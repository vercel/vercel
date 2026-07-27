import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listModels,
  type AccountAvailability,
  type Model,
  type ModelsListResult,
} from '../../util/ai-gateway/models';
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

  return renderResource<ModelsListResult>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching models',
    fetch: async () => {
      const result = await listModels(client);
      const { accountAvailability, availabilityStatus } = result;
      const availabilityComplete =
        availabilityStatus === 'complete' &&
        accountAvailability !== undefined &&
        result.models.every(model => typeof model.available === 'boolean');
      if (!availabilityComplete) {
        output.warn(
          'Model availability could not be determined. Retry before treating unannotated models as available.'
        );
      }
      if (accountAvailability && !accountAvailability.available) {
        output.warn(accountAvailabilityMessage(accountAvailability));
      }
      return result;
    },
    toJSON: result => ({
      models: result.models,
      ...(result.availabilityStatus && {
        availability_status: result.availabilityStatus,
      }),
      ...(result.accountAvailability && {
        account_availability: result.accountAvailability,
      }),
    }),
    isEmpty: result => result.models.length === 0,
    emptyMessage: 'No models found.',
    header: () => 'Models',
    renderTable: result =>
      printModelsTable(result.models, result.accountAvailability),
  });
}

function accountAvailabilityMessage(account: AccountAvailability): string {
  switch (account.unavailable_reason) {
    case 'payment_method_required':
      return 'Add a payment method before running models for this team.';
    case 'insufficient_funds':
      return 'Add AI Gateway credits before running models for this team.';
    case 'quota_exceeded':
      return 'The active API key or team budget has been reached.';
    case 'quota_invalid':
      return "The active API key's quota settings are invalid.";
    case 'team_blocked':
      return "This team can't run AI Gateway models.";
    default:
      return "This account can't run AI Gateway models.";
  }
}

function printModelsTable(
  models: Model[],
  accountAvailability?: AccountAvailability
) {
  // The CLI explicitly requests availability. Keep this defensive check for a
  // degraded Gateway response, where annotations are intentionally omitted
  // rather than presented as optimistic `available: true` verdicts.
  const showAvailability = models.some(m => m.available !== undefined);

  const availabilityCell = (model: Model): string => {
    if (model.available === undefined) return chalk.gray('–');
    if (model.available) return chalk.green('yes');
    if (
      model.unavailable_reason === 'account_unavailable' &&
      accountAvailability &&
      !accountAvailability.available
    ) {
      return chalk.red('no');
    }
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
