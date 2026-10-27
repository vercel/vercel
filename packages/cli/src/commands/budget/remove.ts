import type Client from '../../util/client';
import {
  findBudget,
  removeBudget,
  budgetAmountDollars,
  formatUsdWhole,
  removeReceipt,
  TEAM_BUDGET,
} from '../../util/budget/api';
import { resolveBudgetTeam } from '../../util/budget/ensure-team';
import { rejectUnexpectedArgs } from '../../util/budget/reject-unexpected-args';
import output from '../../output-manager';
import { BudgetRemoveTelemetryClient } from '../../util/telemetry/commands/budget/remove';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

export default async function remove(client: Client, argv: string[]) {
  const telemetry = new BudgetRemoveTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts, args } = parsedArgs;
  const yes = opts['--yes'] as boolean | undefined;

  if (rejectUnexpectedArgs(args, 'budgets remove')) {
    return 2;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionFormat(opts['--format'] ? 'json' : undefined);
  telemetry.trackCliFlagJson(opts['--json']);

  const team = await resolveBudgetTeam(client);
  if (!team) {
    return 2;
  }

  const selector = TEAM_BUDGET;
  output.spinner('Fetching budgets…');

  let target;
  try {
    target = await findBudget(client, selector);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  if (!target) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          removeReceipt({
            team,
            alreadyAbsent: true,
            disabled: null,
            scope: selector.scope,
          }),
          null,
          2
        )}\n`
      );
    } else {
      output.log(`No budget to remove on team ${team.slug}.`);
    }
    return 0;
  }

  const amountLabel = formatUsdWhole(budgetAmountDollars(target));

  if (!yes) {
    if (!client.stdin.isTTY || client.nonInteractive) {
      output.error('To remove in non-interactive mode, re-run with --yes.');
      return 2;
    }
    const confirmed = await client.input.confirm(
      `Remove the ${amountLabel} budget on team ${team.slug}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled.');
      return 0;
    }
  }

  output.spinner(`Removing budget on team ${team.slug}…`);

  try {
    await removeBudget(client, target.id);
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
    client.stdout.write(
      `${JSON.stringify(
        removeReceipt({
          team,
          alreadyAbsent: false,
          disabled: target.id,
          scope: selector.scope,
        }),
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(`Removed the ${amountLabel} budget on team ${team.slug}.`);
  return 0;
}
