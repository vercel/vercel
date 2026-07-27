import type Client from '../../util/client';
import { archiveBudgetDefault } from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { AiGatewayBudgetsDefaultsRemoveTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults-remove';
import { budgetsDefaultsRemoveSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
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
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliFlagYes(yes);
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

  if (!yes) {
    if (client.nonInteractive) {
      output.error('To remove in non-interactive mode, re-run with --yes.');
      return 1;
    }
    const confirmed = await client.input.confirm(
      'Remove the budget default policy?',
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  output.spinner('Removing budget default…');

  try {
    await archiveBudgetDefault(client);
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(`${JSON.stringify({ removed: true }, null, 2)}\n`);
    } else {
      printAlignedLabel('Removed', 'budget default', { gutter: '✓' });
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
