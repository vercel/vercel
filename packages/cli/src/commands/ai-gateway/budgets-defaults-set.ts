import type Client from '../../util/client';
import {
  parseBudgetDefaultScope,
  type BudgetRefreshPeriod,
} from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import { setScopeDefault } from './budgets-scope-default';
import output from '../../output-manager';
import { AiGatewayBudgetsDefaultsSetTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults-set';
import { budgetsDefaultsSetSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  getRenamedOption,
  reportRenamedOptionError,
} from '../../util/renamed-option';
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
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const refreshPeriod = opts['--refresh-period'] as string | undefined;

  telemetry.trackCliArgumentScope(args[0]);
  telemetry.trackCliOptionAmount(opts['--amount']);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const amount = getRenamedOption<number>(opts, '--amount', '--limit', {
    json: asJson,
  });
  if ('error' in amount) {
    return reportRenamedOptionError(client, amount.error, { json: asJson });
  }
  const limit = amount.value;

  const scopeResult = parseBudgetDefaultScope(args);
  if ('error' in scopeResult) {
    output.error(scopeResult.error);
    return 2;
  }
  const { scopeType } = scopeResult;

  if (limit === undefined || Number.isNaN(limit) || limit < 1) {
    output.error('The --amount option is required and must be at least 1.');
    return 2;
  }
  if (
    refreshPeriod !== undefined &&
    !REFRESH_PERIODS.includes(refreshPeriod as BudgetRefreshPeriod)
  ) {
    output.error(
      `The --refresh-period option must be one of: ${REFRESH_PERIODS.join(', ')}.`
    );
    return 2;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return await setScopeDefault(client, {
    scopeType,
    limit,
    refreshPeriod: refreshPeriod as BudgetRefreshPeriod | undefined,
    asJson,
    warnings: [amount.warning],
  });
}
