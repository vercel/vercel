import type Client from '../../util/client';
import {
  listBudgets,
  listScopeBudgetDefaults,
  parseBudgetScope,
  BUDGET_DEFAULT_APPLIES_TO,
  type Budget,
} from '../../util/ai-gateway/budgets';
import {
  describeApiKeyLookupError,
  findApiKeyByIdOrName,
} from '../../util/ai-gateway/api-keys';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { ProjectNotFound } from '../../util/errors-ts';
import {
  getTeamMemberByIdentifier,
  teamMemberLabel,
} from '../../util/teams/get-team-member';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { AiGatewayBudgetsInspectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-inspect';
import { budgetsInspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsInspectSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  telemetry.trackCliArgumentScope(args[0]);
  telemetry.trackCliArgumentName(args[1]);
  telemetry.trackCliFlagDefault(opts['--default']);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const isDefault = opts['--default'] as boolean | undefined;
  const scopeResult = parseBudgetScope(args, { isDefault });
  if ('error' in scopeResult) {
    output.error(scopeResult.error);
    return 2;
  }
  const { scope } = scopeResult;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  if (scope.isDefault) {
    return await inspectScopeDefault(client, scope.scopeType, asJson);
  }

  let scopeId: string | undefined;
  let targetName: string | undefined;
  if (scope.scopeType === 'team') {
    const team = await getTeamByIdOrSlug(
      client,
      client.config.currentTeam as string
    ).catch(() => null);
    targetName = team?.slug || team?.name;
  } else if (scope.scopeType === 'project') {
    const resolved = await getProjectByNameOrId(client, scope.name);
    if (resolved instanceof ProjectNotFound) {
      output.error(`Project not found: ${scope.name}`);
      return 1;
    }
    scopeId = resolved.id;
    targetName = resolved.name || scope.name;
  } else if (scope.scopeType === 'user') {
    const member = await getTeamMemberByIdentifier(
      client,
      client.config.currentTeam as string,
      scope.name
    );
    if (!member) {
      output.error(`Team member not found: ${scope.name}`);
      return 1;
    }
    scopeId = member.uid;
    targetName = teamMemberLabel(member);
  } else if (scope.scopeType === 'api-key') {
    const resolved = await findApiKeyByIdOrName(client, scope.name);
    if ('error' in resolved) {
      output.error(describeApiKeyLookupError(scope.name, resolved));
      return 1;
    }
    scopeId = resolved.apiKey.id;
    targetName = resolved.apiKey.name || scopeId;
  }

  output.spinner('Fetching budget…');

  let budgets: Budget[];
  try {
    budgets = await listBudgets(client, scope.scopeType);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
  output.stopSpinner();

  // User scope ids arrive `usr_`-prefixed; compare both forms.
  const budget = budgets.find(
    row =>
      row.scopeType === scope.scopeType &&
      (scope.scopeType === 'team' ||
        row.scopeId === scopeId ||
        row.scopeId === `usr_${scopeId}`)
  );

  const label =
    scope.scopeType === 'team' ? 'the team' : (targetName as string);
  if (!budget) {
    output.error(`No budget found for ${label}.`);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(budget, null, 2)}\n`);
    return 0;
  }

  printAlignedLabel('Scope', budget.scopeType);
  printAlignedLabel('Name', budget.name || targetName || budget.scopeId);
  printAlignedLabel('Limit', `$${budget.limitAmount}`);
  printAlignedLabel('Spent', `$${budget.currentSpend.toFixed(2)}`);
  printAlignedLabel('Refresh', budget.refreshPeriod);
  if (budget.source === 'default') {
    printAlignedLabel('Source', `${budget.scopeType} default`);
  }
  return 0;
}

// The --default path: reads the scope's policy row from the defaults list.
async function inspectScopeDefault(
  client: Client,
  scopeType: 'project' | 'user' | 'api-key',
  asJson: boolean
) {
  output.spinner('Fetching budget default…');

  let row;
  try {
    const defaults = await listScopeBudgetDefaults(client);
    // `scopeType` is already narrowed to the default-capable scopes; the found
    // row shares it (the type still admits a hidden team row).
    row = defaults.find(d => d.scopeType === scopeType && d.active !== false);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
  output.stopSpinner();

  if (!row) {
    output.error(
      `No ${scopeType} budget default set. Set one with ${getCommandName(`ai-gateway budgets set ${scopeType} --default`)}.`
    );
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(row, null, 2)}\n`);
    return 0;
  }

  printAlignedLabel('Scope', row.scopeType);
  printAlignedLabel('Limit', `$${row.limitAmount}`);
  printAlignedLabel('Refresh', row.refreshPeriod);
  printAlignedLabel('Applies to', BUDGET_DEFAULT_APPLIES_TO[scopeType]);
  return 0;
}
