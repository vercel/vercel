import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listBudgets, type Budget } from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayBudgetsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-list';
import { budgetsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsListSubcommand.options
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

  const lsStamp = stamp();
  output.spinner('Fetching budgets');

  let budgets: Budget[];
  try {
    budgets = await listBudgets(client);
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
    client.stdout.write(`${JSON.stringify({ budgets }, null, 2)}\n`);
    return 0;
  }

  if (budgets.length === 0) {
    output.log(
      `No budgets found. Set one with ${getCommandName('ai-gateway budgets set')}.`
    );
    return 0;
  }

  output.log(`Budgets ${lsStamp()}`);
  client.stdout.write(printBudgetsTable(budgets));
  return 0;
}

function printBudgetsTable(budgets: Budget[]) {
  return `${table(
    [
      ['scope', 'id', 'limit', 'spent', 'refresh'].map(header =>
        chalk.gray(header)
      ),
      ...budgets.map(budget => [
        budget.scopeType,
        budget.scopeId,
        `$${budget.limitAmount}`,
        `$${budget.currentSpend.toFixed(2)}`,
        budget.refreshPeriod,
      ]),
    ],
    { align: ['l', 'l', 'r', 'r', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
