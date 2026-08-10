import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listBudgets, type Budget } from '../../util/ai-gateway/budgets';
import { listApiKeys } from '../../util/ai-gateway/api-keys';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import getTeamById from '../../util/teams/get-team-by-id';
import {
  getTeamMemberByIdentifier,
  teamMemberLabel,
} from '../../util/teams/get-team-member';
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

  // The API resolves a name for most api-key rows, but default-covered rows can
  // arrive without one; fetch the key roster once to fill those gaps by id.
  let apiKeyNames = new Map<string, string>();
  if (budgets.some(budget => budget.scopeType === 'api-key' && !budget.name)) {
    try {
      const apiKeys = await listApiKeys(client);
      apiKeyNames = new Map(apiKeys.map(key => [key.id, key.name]));
    } catch {
      // Non-fatal: fall back to the id for unresolved keys.
    }
  }

  const names = await Promise.all(
    budgets.map(budget => resolveScopeName(client, budget, apiKeyNames))
  );

  output.stopSpinner();

  output.log('Budgets');
  client.stdout.write(printBudgetsTable(budgets, names));
  return 0;
}

// Budgets carry only the internal scope id; resolve it to a human name for the
// table (team slug, project name, or member handle), falling back to the id when
// the resource can't be resolved. JSON output keeps the raw scopeId as the stable
// contract. api-key rows use the name the API resolved, falling back to the
// roster lookup and then the id.
async function resolveScopeName(
  client: Client,
  budget: Budget,
  apiKeyNames: Map<string, string>
): Promise<string> {
  try {
    switch (budget.scopeType) {
      case 'team': {
        const team = await getTeamById(client, budget.scopeId);
        return team.slug || team.name || budget.scopeId;
      }
      case 'project': {
        const project = await getProjectByNameOrId(client, budget.scopeId);
        return project instanceof ProjectNotFound
          ? budget.scopeId
          : project.name || budget.scopeId;
      }
      case 'user': {
        const member = await getTeamMemberByIdentifier(
          client,
          client.config.currentTeam as string,
          budget.scopeId
        );
        return member ? teamMemberLabel(member) : budget.scopeId;
      }
      default:
        return budget.name || apiKeyNames.get(budget.scopeId) || budget.scopeId;
    }
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
