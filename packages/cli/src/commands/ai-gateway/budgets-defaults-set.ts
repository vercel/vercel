import type Client from '../../util/client';
import {
  getBudgetDefault,
  upsertBudgetDefault,
  type BudgetRefreshPeriod,
  type UpsertBudgetDefaultInput,
} from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { AiGatewayBudgetsDefaultsSetTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults-set';
import { budgetsDefaultsSetSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

const REFRESH_PERIODS: BudgetRefreshPeriod[] = [
  'daily',
  'weekly',
  'monthly',
  'none',
];

// A tier flag omitted → undefined (unchanged); `none` → null (clear); a number
// (>= 1) sets it. Anything else is a validation error.
function parseTier(
  raw: string | undefined,
  flag: string
): { value: number | null | undefined } | { error: string } {
  if (raw === undefined) {
    return { value: undefined };
  }
  if (raw === 'none') {
    return { value: null };
  }
  const amount = Number(raw);
  if (Number.isNaN(amount) || amount < 1) {
    return {
      error: `${flag} must be a number of at least 1, or 'none' to clear the tier.`,
    };
  }
  return { value: amount };
}

function tier(amount: number | undefined): string {
  return amount === undefined ? 'Not set' : `$${amount}`;
}

export default async function set(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsDefaultsSetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsDefaultsSetSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const perProjectRaw = opts['--per-project'] as string | undefined;
  const perApiKeyRaw = opts['--per-api-key'] as string | undefined;
  const refreshPeriod = opts['--refresh-period'] as string | undefined;

  telemetry.trackCliOptionPerProject(perProjectRaw);
  telemetry.trackCliOptionPerApiKey(perApiKeyRaw);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const perProject = parseTier(perProjectRaw, '--per-project');
  if ('error' in perProject) {
    output.error(perProject.error);
    return 1;
  }
  const perApiKey = parseTier(perApiKeyRaw, '--per-api-key');
  if ('error' in perApiKey) {
    output.error(perApiKey.error);
    return 1;
  }

  const noTierChange =
    perProject.value === undefined && perApiKey.value === undefined;
  if (noTierChange && refreshPeriod === undefined) {
    output.error(
      'Nothing to set. Pass --per-project, --per-api-key, or --refresh-period.'
    );
    return 1;
  }

  if (
    refreshPeriod !== undefined &&
    !REFRESH_PERIODS.includes(refreshPeriod as BudgetRefreshPeriod)
  ) {
    output.error(
      `The --refresh-period flag must be one of: ${REFRESH_PERIODS.join(', ')}.`
    );
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  output.spinner('Setting budget default…');

  try {
    // The upsert always carries a refreshPeriod (shared across tiers); when the
    // caller doesn't pass one, keep the existing policy's cadence, else default
    // to monthly so a first-time tier-only set still has a schedule.
    let resolvedRefresh = refreshPeriod as BudgetRefreshPeriod | undefined;
    if (resolvedRefresh === undefined) {
      const current = await getBudgetDefault(client);
      resolvedRefresh = current?.refreshPeriod ?? 'monthly';
    }

    const input: UpsertBudgetDefaultInput = { refreshPeriod: resolvedRefresh };
    if (perProject.value !== undefined) {
      input.perProjectLimit = perProject.value;
    }
    if (perApiKey.value !== undefined) {
      input.perApiKeyLimit = perApiKey.value;
    }

    const budgetDefault = await upsertBudgetDefault(client, input);

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(budgetDefault, null, 2)}\n`);
    } else {
      printAlignedLabel('Set budget default', '', { gutter: '✓' });
      printAlignedLabel('Per project', tier(budgetDefault.perProjectLimit));
      printAlignedLabel('Per api key', tier(budgetDefault.perApiKeyLimit));
      printAlignedLabel('Refresh', budgetDefault.refreshPeriod);
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
