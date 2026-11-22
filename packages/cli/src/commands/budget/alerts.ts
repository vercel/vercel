import plural from 'pluralize';
import type Client from '../../util/client';
import {
  listBudgetAlerts,
  TEAM_BUDGET,
  type BudgetAlertsPage,
} from '../../util/budget/api';
import { printBudgetAlertsTable } from '../../util/budget/format-state';
import { resolveBudgetTeam } from '../../util/budget/ensure-team';
import {
  decodeBudgetAlertsCursor,
  encodeBudgetAlertsCursor,
} from '../../util/budget/alerts-cursor';
import {
  getNextPageCommand,
  MAX_LIST_LIMIT,
  printNextPageCommand,
} from '../../util/pagination';
import { INVALID_NEXT_MESSAGE } from '../../util/get-pagination-opts';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { rejectUnexpectedArgs } from '../../util/budget/reject-unexpected-args';
import output from '../../output-manager';
import { BudgetAlertsTelemetryClient } from '../../util/telemetry/commands/budget/alerts';
import { alertsListSubcommand, alertsSubcommand } from './command';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import {
  handleValidationError,
  outputError,
  validateOptionalIntegerRange,
  validateTimeBound,
  validateTimeOrder,
} from '../../util/command-validation';

export default async function alerts(client: Client, argv: string[]) {
  const telemetry = new BudgetAlertsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const action = getSubcommand(argv, {
    list: getCommandAliases(alertsListSubcommand),
  });
  if (action.subcommand === 'list') {
    telemetry.trackCliSubcommandList(action.subcommandOriginal);
  }

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(alertsSubcommand.options);
  try {
    parsedArgs = parseArguments(action.args, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts, args } = parsedArgs;

  if (rejectUnexpectedArgs(args, 'budgets alerts')) {
    return 2;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionSince(opts['--since']);
  telemetry.trackCliOptionUntil(opts['--until']);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);
  telemetry.trackCliOptionFormat(opts['--format'] ? 'json' : undefined);
  telemetry.trackCliFlagJson(opts['--json']);

  const nextResult = decodeBudgetAlertsCursor(opts['--next']);
  if (!nextResult.valid) {
    return handleValidationError(nextResult, asJson, client);
  }
  const cursor = nextResult.value;

  const warnings: { reason: string; message: string }[] = [];
  let limit = opts['--limit'];
  if (
    typeof limit === 'number' &&
    Number.isInteger(limit) &&
    limit > MAX_LIST_LIMIT
  ) {
    const message = `--limit ${limit} is above the maximum of ${MAX_LIST_LIMIT}. Using ${MAX_LIST_LIMIT}.`;
    warnings.push({ reason: AGENT_REASON.LIMIT_CLAMPED, message });
    if (!asJson) {
      output.warning(message);
    }
    limit = MAX_LIST_LIMIT;
  }
  const limitResult = validateOptionalIntegerRange(limit, {
    flag: '--limit',
    min: 1,
    max: MAX_LIST_LIMIT,
  });
  if (!limitResult.valid) {
    return handleValidationError(limitResult, asJson, client);
  }
  const sinceResult = validateTimeBound(opts['--since']);
  if (!sinceResult.valid) {
    return handleValidationError(sinceResult, asJson, client);
  }
  const untilResult = validateTimeBound(opts['--until']);
  if (!untilResult.valid) {
    return handleValidationError(untilResult, asJson, client);
  }
  const order = validateTimeOrder(sinceResult.value, untilResult.value);
  if (!order.valid) {
    return handleValidationError(order, asJson, client);
  }

  const team = await resolveBudgetTeam(client);
  if (!team) {
    return 2;
  }
  if (cursor && cursor.teamId !== team.id) {
    return outputError(
      client,
      asJson,
      'INVALID_NEXT',
      `This --next cursor is from another team, not ${team.slug}. Use the --scope it was printed with.`
    );
  }

  // With --next, the cursor's window wins over --since and --until, so every
  // page covers the same range as the first.
  const since = cursor ? cursor.since : sinceResult.value?.getTime();
  const until = cursor ? cursor.until : untilResult.value?.getTime();

  output.spinner('Fetching budget alerts…');

  const selector = TEAM_BUDGET;
  let page: BudgetAlertsPage;
  try {
    page = await listBudgetAlerts(client, selector, {
      since,
      until,
      limit: limitResult.value,
      cursor: cursor?.cursor,
    });
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      if (err.code === 'invalid_cursor') {
        return outputError(
          client,
          asJson,
          'INVALID_NEXT',
          INVALID_NEXT_MESSAGE
        );
      }
      return outputError(client, asJson, err.code || 'API_ERROR', err.message);
    }
    throw err;
  }

  output.stopSpinner();

  const next = page.nextCursor
    ? encodeBudgetAlertsCursor({
        cursor: page.nextCursor,
        teamId: team.id,
        since,
        until,
      })
    : null;

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          teamId: team.id,
          teamSlug: team.slug,
          alerts: page.data,
          pagination: { next },
          ...(warnings.length > 0 ? { warnings } : {}),
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  const where = `on team ${team.slug}`;

  if (page.data.length === 0) {
    output.log(
      cursor
        ? `No more budget alerts ${where}.`
        : `No budget alerts found ${where}.`
    );
    return 0;
  }

  output.log(`${plural('budget alert', page.data.length, true)} ${where}`);
  client.stdout.write(printBudgetAlertsTable(page.data));

  if (next) {
    printNextPageCommand(getNextPageCommand(client.argv, next, WINDOW_FLAGS));
  }

  return 0;
}

/** The window rides in the cursor, so the next-page command leaves these out. */
const WINDOW_FLAGS = ['--since', '-s', '--until', '-u'];
