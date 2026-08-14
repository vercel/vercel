import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listBudgets, type Budget } from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import getTeamById from '../../util/teams/get-team-by-id';
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

  output.spinner('Fetching budgets…');

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

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(`${JSON.stringify({ budgets }, null, 2)}\n`);
    return 0;
  }

  if (budgets.length === 0) {
    output.stopSpinner();
    output.log(
      `No budgets found. Set one with ${getCommandName('ai-gateway budgets set')}.`
    );
    return 0;
  }

  const names = await Promise.all(
    budgets.map(budget => resolveScopeName(client, budget))
  );

  output.stopSpinner();

  output.log('Budgets');
  client.stdout.write(printBudgetsTable(budgets, names));
  return 0;
}

// Budgets carry only the internal scope id; resolve it to a human name for the
// table (team slug or project name), falling back to the id when the resource
// can't be resolved. JSON output keeps the raw scopeId as the stable contract.
async function resolveScopeName(
  client: Client,
  budget: Budget
): Promise<string> {
  try {
    if (budget.scopeType === 'team') {
      const team = await getTeamById(client, budget.scopeId);
      return team.slug || team.name || budget.scopeId;
    }
    const project = await getProjectByNameOrId(client, budget.scopeId);
    if (project instanceof ProjectNotFound) {
      return budget.scopeId;
    }
    return project.name || budget.scopeId;
  } catch {
    return budget.scopeId;
  }
}

function printBudgetsTable(budgets: Budget[], names: string[]) {
  return `${table(
    [
      ['scope', 'name', 'limit', 'spent', 'refresh'].map(header =>
        chalk.gray(header)
      ),
      ...budgets.map((budget, i) => [
        budget.scopeType,
        names[i],
        `$${budget.limitAmount}`,
        `$${budget.currentSpend.toFixed(2)}`,
        budget.refreshPeriod,
      ]),
    ],
    { align: ['l', 'l', 'r', 'r', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
