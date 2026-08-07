import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listScopeBudgetDefaults,
  BUDGET_DEFAULT_SCOPE_TYPES,
  type ScopeBudgetDefault,
  type BudgetDefaultScopeType,
} from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import output from '../../output-manager';
import { AiGatewayBudgetsDefaultsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults-list';
import { budgetsDefaultsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsDefaultsListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsDefaultsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  output.spinner('Fetching budget defaults…');

  let defaults: ScopeBudgetDefault[];
  try {
    defaults = await listScopeBudgetDefaults(client);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  // Only surface scopes the CLI manages (project, api-key); the API may also
  // return team/user rows, and the user scope isn't released yet.
  const shown = defaults.filter(d =>
    BUDGET_DEFAULT_SCOPE_TYPES.includes(d.scopeType as BudgetDefaultScopeType)
  );

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ defaults: shown }, null, 2)}\n`);
    return 0;
  }

  if (shown.length === 0) {
    output.log(
      `No budget defaults set. Set one with ${getCommandName('ai-gateway budgets defaults set')}.`
    );
    return 0;
  }

  output.log('Budget defaults');
  client.stdout.write(printDefaultsTable(shown));
  return 0;
}

function printDefaultsTable(defaults: ScopeBudgetDefault[]) {
  return `${table(
    [
      ['scope', 'limit', 'refresh'].map(header => chalk.gray(header)),
      ...defaults.map(d => [d.scopeType, `$${d.limitAmount}`, d.refreshPeriod]),
    ],
    { align: ['l', 'r', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
