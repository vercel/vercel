import type Client from '../../util/client';
import {
  findBudget,
  getTeamSpend,
  spendDollars,
  spendPayload,
  listBudgetAlerts,
  NO_RETRY,
  toBudgetState,
  budgetStatePayload,
  formatUsd,
  TEAM_BUDGET,
  type BudgetAlert,
  type BudgetSelector,
  type BudgetState,
  type TeamSpend,
} from '../../util/budget/api';
import {
  printBudgetAlertsTable,
  printBudgetsTable,
  warnUnavailableWebhooks,
} from '../../util/budget/format-state';
import { resolveBudgetTeam } from '../../util/budget/ensure-team';
import { rejectUnexpectedArgs } from '../../util/budget/reject-unexpected-args';
import output from '../../output-manager';
import { scopedBudgetCommand } from '../../util/budget/scoped-command';
import { BudgetInspectTelemetryClient } from '../../util/telemetry/commands/budget/inspect';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new BudgetInspectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts, args } = parsedArgs;

  if (rejectUnexpectedArgs(args, 'budgets')) {
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

  const selector = TEAM_BUDGET;
  output.spinner('Fetching spend…');

  let spend: TeamSpend | null;
  let state: BudgetState | undefined;
  // `null` means the alerts were not loaded, not that there are none.
  let recentAlerts: BudgetAlert[] | null = null;
  try {
    const [budget, teamSpend] = await Promise.all([
      findBudget(client, selector),
      // Spend is context here; if it can't be loaded the table shows `—`.
      getTeamSpend(client, team.id, selector, { retry: NO_RETRY }).catch(
        () => null
      ),
    ]);
    spend = teamSpend;
    if (budget) {
      [state, recentAlerts] = await Promise.all([
        toBudgetState(client, budget, selector),
        fetchRecentAlerts(client, selector, budget.id),
      ]);
    }
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  const spent = spendDollars(spend);

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          teamId: team.id,
          teamSlug: team.slug,
          spend: spendPayload(spent, state?.amount ?? null),
          budget: state ? budgetStatePayload(state) : null,
          recentAlerts,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (!state) {
    const spentLine =
      spent === null ? '' : ` Current spend is ${formatUsd(spent)}.`;
    output.log(
      `No budget set on team ${team.slug}.${spentLine} Create one with ${scopedBudgetCommand(client, team, 'budgets set --amount <dollars>')}.`
    );
    return 0;
  }

  warnUnavailableWebhooks([state]);
  client.stdout.write(printBudgetsTable([state], () => spent));

  if (recentAlerts === null) {
    return 0;
  }
  if (recentAlerts.length === 0) {
    output.log('No alerts on this budget yet.');
    return 0;
  }
  output.log('Recent alerts');
  client.stdout.write(printBudgetAlertsTable(recentAlerts));
  return 0;
}

const RECENT_ALERTS_LIMIT = 3;

/** Alert history is extra context here, so a failed fetch must not fail inspect. */
async function fetchRecentAlerts(
  client: Client,
  selector: BudgetSelector,
  budgetId: string
): Promise<BudgetAlert[] | null> {
  try {
    const page = await listBudgetAlerts(
      client,
      selector,
      { budgetId, limit: RECENT_ALERTS_LIMIT },
      { retry: NO_RETRY }
    );
    return page.data;
  } catch (err: unknown) {
    output.debug(`Could not load recent budget alerts: ${err}`);
    return null;
  }
}
