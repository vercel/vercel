import type Client from '../../util/client';
import {
  listBudgets,
  toBudgetState,
  budgetStatePayload,
  type BudgetState,
  type BudgetTeam,
} from '../../util/budget/api';
import {
  printBudgetsTable,
  warnUnavailableWebhooks,
} from '../../util/budget/format-state';
import { resolveBudgetTeam } from '../../util/budget/ensure-team';
import { rejectUnexpectedArgs } from '../../util/budget/reject-unexpected-args';
import output from '../../output-manager';
import { scopedBudgetCommand } from '../../util/budget/scoped-command';
import { BudgetListTelemetryClient } from '../../util/telemetry/commands/budget/list';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new BudgetListTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts, args } = parsedArgs;

  if (rejectUnexpectedArgs(args, 'budgets list')) {
    return 2;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionFormat(opts['--format'] ? 'json' : undefined);
  telemetry.trackCliFlagJson(opts['--json']);

  const team = await resolveBudgetTeam(client);
  if (!team) {
    return 2;
  }

  output.spinner('Fetching budgets…');

  try {
    const budgets = await listBudgets(client);
    const states = await Promise.all(
      budgets.map(budget => toBudgetState(client, budget))
    );
    output.stopSpinner();
    return printTeamList(client, {
      asJson,
      states,
      team,
    });
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}

function printTeamList(
  client: Client,
  {
    asJson,
    states,
    team,
  }: {
    asJson: boolean;
    states: BudgetState[];
    team: BudgetTeam;
  }
) {
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          teamId: team.id,
          teamSlug: team.slug,
          budgets: states.map(budgetStatePayload),
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (states.length === 0) {
    output.log(
      `No budgets found on team ${team.slug}. Set one with ${scopedBudgetCommand(client, team, 'budgets set --amount <dollars>')}.`
    );
    return 0;
  }

  output.log('Budgets');
  warnUnavailableWebhooks(states);
  client.stdout.write(printBudgetsTable(states));
  return 0;
}
