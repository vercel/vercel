import type Client from '../../util/client';
import {
  setBudget,
  findBudget,
  toBudgetState,
  budgetAmountDollars,
  budgetPauses,
  setSavedReceipt,
  thresholdsForSet,
  formatUsdWhole,
  hasPauseThreshold,
  pausePercentsOutside100,
  TEAM_BUDGET,
  type BudgetTeam,
} from '../../util/budget/api';
import {
  printBudgetsTable,
  warnUnavailableWebhooks,
} from '../../util/budget/format-state';
import { resolveBudgetTeam } from '../../util/budget/ensure-team';
import { scopedBudgetCommand } from '../../util/budget/scoped-command';
import { rejectUnexpectedArgs } from '../../util/budget/reject-unexpected-args';
import getWebhook from '../../util/webhooks/get-webhook';
import output from '../../output-manager';
import { BudgetSetTelemetryClient } from '../../util/telemetry/commands/budget/set';
import { setSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';

export default async function set(client: Client, argv: string[]) {
  const telemetry = new BudgetSetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(setSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts, args } = parsedArgs;

  if (rejectUnexpectedArgs(args, 'budgets set')) {
    return 2;
  }

  const amountFlag = opts['--amount'] as number | undefined;
  const pauseFlag = opts['--pause'] as boolean | undefined;
  const noPauseFlag = opts['--no-pause'] as boolean | undefined;
  const webhookFlag = opts['--webhook'] as string | undefined;
  const noWebhookFlag = opts['--no-webhook'] as boolean | undefined;
  const pauseSpecified = Boolean(pauseFlag || noPauseFlag);
  const webhookSpecified = webhookFlag !== undefined || Boolean(noWebhookFlag);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionAmount(amountFlag);
  telemetry.trackCliFlagPause(pauseFlag);
  telemetry.trackCliFlagNoPause(noPauseFlag);
  telemetry.trackCliOptionWebhook(webhookFlag);
  telemetry.trackCliFlagNoWebhook(noWebhookFlag);
  telemetry.trackCliOptionFormat(opts['--format'] ? 'json' : undefined);
  telemetry.trackCliFlagJson(opts['--json']);

  if (pauseFlag && noPauseFlag) {
    output.error('Cannot use --pause and --no-pause together.');
    return 2;
  }
  if (webhookFlag !== undefined && noWebhookFlag) {
    output.error('Cannot use --webhook and --no-webhook together.');
    return 2;
  }
  if (webhookFlag !== undefined && webhookFlag.trim() === '') {
    output.error('Provide a webhook URL, or use --no-webhook to remove it.');
    return 2;
  }

  if (amountFlag === undefined && !pauseSpecified && !webhookSpecified) {
    output.error(
      `Specify ${getCommandName('budgets set --amount <dollars>')} to create a budget, or --pause / --webhook to update the existing one.`
    );
    return 2;
  }

  if (amountFlag !== undefined) {
    if (!Number.isInteger(amountFlag)) {
      output.error('A budget must be a whole number of dollars.');
      return 2;
    }
    if (amountFlag < 1) {
      output.error('A budget must be at least $1.');
      return 2;
    }
  }

  const team = await resolveBudgetTeam(client);
  if (!team) {
    return 2;
  }

  const selector = TEAM_BUDGET;
  output.spinner('Fetching budget…');

  let webhookSecret: string | undefined;
  try {
    const existing = await findBudget(client, selector);

    let amount: number;
    if (amountFlag !== undefined) {
      amount = amountFlag;
    } else if (existing) {
      amount = budgetAmountDollars(existing);
    } else {
      output.stopSpinner();
      output.error(
        `No budget to update. Create one with ${scopedBudgetCommand(client, team, 'budgets set --amount <dollars>')}.`
      );
      return 1;
    }

    let pause: boolean;
    if (pauseFlag) {
      pause = true;
    } else if (noPauseFlag) {
      pause = false;
    } else if (existing) {
      pause = budgetPauses(existing);
    } else {
      pause = false;
    }

    let webhookUrl: string | undefined;
    if (noWebhookFlag) {
      // Omitting webhookUrl on POST deletes the webhook.
      webhookUrl = undefined;
    } else if (webhookFlag !== undefined) {
      webhookUrl = webhookFlag.trim();
    } else if (existing?.webhookId) {
      const webhook = await getWebhook(client, existing.webhookId);
      webhookUrl = webhook.url;
    }

    const thresholds = thresholdsForSet({
      existing: existing?.thresholds,
      pause,
      pauseSpecified,
      webhookUrl,
      webhookSpecified,
    });
    if (pauseFlag && !hasPauseThreshold(thresholds)) {
      output.stopSpinner();
      output.error(
        'Pause only applies at 100% of the budget. This budget has no 100% threshold.'
      );
      return 1;
    }
    const invalidPause = pausePercentsOutside100(thresholds);
    if (invalidPause.length > 0) {
      output.stopSpinner();
      output.error(
        `Pause only applies at 100% of the budget. This budget pauses at ${invalidPause
          .map(percent => `${percent}%`)
          .join(
            ', '
          )}. Re-run with --pause to move it to 100%, or --no-pause to clear it.`
      );
      return 1;
    }

    output.stopSpinner();
    if (pauseFlag && !asJson) {
      output.log(
        `Pause all projects on team ${team.slug} at 100% (${formatUsdWhole(amount)}). Production deployments become unavailable.`
      );
    }
    output.spinner('Saving budget…');

    const posted = await setBudget(client, {
      amount,
      thresholds,
      ...selector,
      ...(webhookUrl ? { webhookUrl } : {}),
    });
    webhookSecret = posted.webhookSecret;

    let state: Awaited<ReturnType<typeof toBudgetState>> | undefined;
    try {
      const row = await findBudget(client, selector);
      if (row) {
        state = await toBudgetState(client, row, selector);
      }
    } catch {
      state = undefined;
    }
    output.stopSpinner();
    if (!state) {
      printSavedWithoutReload(client, {
        asJson,
        team,
        amount,
        webhookSecret,
      });
      return 0;
    }

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          setSavedReceipt({
            team,
            reloaded: state,
            webhookSecret,
            amount,
            scope: selector.scope,
          }),
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(`Budget updated on team ${team.slug}.`);
    warnUnavailableWebhooks([state]);
    client.stdout.write(printBudgetsTable([state]));
    printWebhookSecret(webhookSecret);

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return printSetFailure(err, client, team);
  }
}

function printSavedWithoutReload(
  client: Client,
  {
    asJson,
    team,
    amount,
    webhookSecret,
  }: {
    asJson: boolean;
    team: BudgetTeam;
    amount: number;
    webhookSecret: string | undefined;
  }
) {
  output.warn(
    `Budget saved on team ${team.slug}, but it could not be reloaded. Run ${scopedBudgetCommand(client, team, 'budgets')} to confirm before retrying.`
  );
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        setSavedReceipt({
          team,
          reloaded: null,
          webhookSecret,
          amount,
          scope: TEAM_BUDGET.scope,
        }),
        null,
        2
      )}\n`
    );
  } else {
    printWebhookSecret(webhookSecret);
  }
}

function printSetFailure(
  err: unknown,
  client: Client,
  team: BudgetTeam
): number {
  if (isAPIError(err)) {
    output.error(err.message);
    if (err.status >= 500) {
      printInspectBeforeRetry(client, team);
    }
    return 1;
  }
  output.error(err instanceof Error ? err.message : 'Failed to save budget.');
  printInspectBeforeRetry(client, team);
  return 1;
}

function printInspectBeforeRetry(client: Client, team: BudgetTeam) {
  output.log(
    `If the budget may already exist, run ${scopedBudgetCommand(client, team, 'budgets')} before retrying. Retrying this save can drop a new webhook secret.`
  );
}

function printWebhookSecret(secret?: string) {
  if (!secret) {
    return;
  }
  output.log(`Webhook secret: ${secret}`);
  output.log('Store it now — it cannot be retrieved later.');
}
