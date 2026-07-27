import chalk from 'chalk';
import type Client from '../../util/client';
import {
  getBudgetDefault,
  type BudgetDefault,
} from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { AiGatewayBudgetsDefaultsInspectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults-inspect';
import { budgetsDefaultsInspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

function tier(amount: number | undefined): string {
  return amount === undefined ? 'Not set' : `$${amount}`;
}

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsDefaultsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsDefaultsInspectSubcommand.options
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

  if (!(await ensureTeam(client))) {
    return 1;
  }

  output.spinner('Fetching budget default…');

  let budgetDefault: BudgetDefault | null;
  try {
    budgetDefault = await getBudgetDefault(client);
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
    client.stdout.write(`${JSON.stringify(budgetDefault, null, 2)}\n`);
    return 0;
  }

  if (!budgetDefault || !budgetDefault.active) {
    output.log(
      `No budget default set. Set one with ${getCommandName('ai-gateway budgets defaults set')}.`
    );
    return 0;
  }

  output.print(chalk.bold('  Budget default\n'));
  if (budgetDefault.teamLimit !== undefined) {
    printAlignedLabel('Team', tier(budgetDefault.teamLimit));
  }
  printAlignedLabel('Per project', tier(budgetDefault.perProjectLimit));
  printAlignedLabel('Per api key', tier(budgetDefault.perApiKeyLimit));
  printAlignedLabel('Per user', tier(budgetDefault.perUserLimit));
  printAlignedLabel('Refresh', budgetDefault.refreshPeriod);
  output.print('\n');
  return 0;
}
