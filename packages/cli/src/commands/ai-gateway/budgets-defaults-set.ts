import type Client from '../../util/client';
import {
  upsertScopeBudgetDefault,
  parseBudgetDefaultScope,
  type BudgetRefreshPeriod,
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
  const { args, flags: opts } = parsedArgs;

  const limit = opts['--limit'] as number | undefined;
  const refreshPeriod = opts['--refresh-period'] as string | undefined;

  telemetry.trackCliArgumentScope(args[0]);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const scopeResult = parseBudgetDefaultScope(args);
  if ('error' in scopeResult) {
    output.error(scopeResult.error);
    return 1;
  }
  const { scopeType } = scopeResult;

  if (limit === undefined || Number.isNaN(limit) || limit < 1) {
    output.error('The --limit flag is required and must be at least 1.');
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
    const budgetDefault = await upsertScopeBudgetDefault(client, {
      scopeType,
      limitAmount: limit,
      refreshPeriod: (refreshPeriod as BudgetRefreshPeriod) ?? 'monthly',
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(budgetDefault, null, 2)}\n`);
    } else {
      printAlignedLabel('Set default', scopeType, { gutter: '✓' });
      printAlignedLabel('Limit', `$${budgetDefault.limitAmount}`);
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
