import chalk from 'chalk';
import type Client from '../../util/client';
import { deleteRule } from '../../util/ai-gateway/rules';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayRulesRemoveTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-remove';
import { rulesRemoveSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function remove(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    rulesRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const [ruleId] = args;
  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliArgumentRuleId(ruleId);
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!ruleId) {
    output.error(
      `${getCommandName('ai-gateway rules rm <ruleId>')} expects a rule id.`
    );
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  if (!yes) {
    if (!client.stdin.isTTY) {
      output.error('To remove in non-interactive mode, re-run with --yes.');
      return 1;
    }
    const confirmed = await client.input.confirm(
      `Remove routing rule ${chalk.bold(ruleId)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const removeStamp = stamp();
  output.spinner('Removing routing rule');

  try {
    await deleteRule(client, ruleId);
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ ruleId, removed: true }, null, 2)}\n`
      );
    } else {
      output.success(
        `Routing rule ${chalk.bold(ruleId)} removed ${removeStamp()}`
      );
    }
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err) && err.status === 404) {
      output.error(`Routing rule "${ruleId}" not found.`);
      return 1;
    }
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
