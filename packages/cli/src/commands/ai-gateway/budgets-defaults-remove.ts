import type Client from '../../util/client';
import { parseBudgetDefaultScope } from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import { removeScopeDefault } from './budgets-scope-default';
import output from '../../output-manager';
import { AiGatewayBudgetsDefaultsRemoveTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults-remove';
import { budgetsDefaultsRemoveSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';

export default async function remove(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsDefaultsRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsDefaultsRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliArgumentScope(args[0]);
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const scopeResult = parseBudgetDefaultScope(args);
  if ('error' in scopeResult) {
    output.error(scopeResult.error);
    return 2;
  }
  const { scopeType } = scopeResult;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return await removeScopeDefault(client, scopeType, { yes, asJson });
}
