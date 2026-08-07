import type Client from '../../util/client';
import {
  setBudget,
  parseBudgetScope,
  type BudgetRefreshPeriod,
} from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { AiGatewayBudgetsSetTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-set';
import { budgetsSetSubcommand } from './command';
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
  const telemetry = new AiGatewayBudgetsSetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsSetSubcommand.options
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
  const includeByok = opts['--include-byok'] as boolean | undefined;

  telemetry.trackCliArgumentScope(args[0]);
  telemetry.trackCliArgumentName(args[1]);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const scopeResult = parseBudgetScope(args);
  if ('error' in scopeResult) {
    output.error(scopeResult.error);
    return 1;
  }
  const { scope } = scopeResult;

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

  let projectId: string | undefined;
  if (scope.scopeType === 'project') {
    const resolved = await getProjectByNameOrId(client, scope.name);
    if (resolved instanceof ProjectNotFound) {
      output.error(`Project not found: ${scope.name}`);
      return 1;
    }
    projectId = resolved.id;
  }

  output.spinner('Setting budget…');

  try {
    const budget = await setBudget(client, {
      scopeType: scope.scopeType,
      ...(projectId ? { projectId } : {}),
      limitAmount: limit,
      ...(refreshPeriod
        ? { refreshPeriod: refreshPeriod as BudgetRefreshPeriod }
        : {}),
      ...(includeByok ? { includeByokInQuota: true } : {}),
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(budget, null, 2)}\n`);
    } else {
      const scopeLabel =
        scope.scopeType === 'project' ? `project ${scope.name}` : 'team';
      printAlignedLabel('Set budget', scopeLabel, { gutter: '✓' });
      printAlignedLabel('Limit', `$${budget.limitAmount}`);
      printAlignedLabel('Refresh', budget.refreshPeriod);
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
