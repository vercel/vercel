import chalk from 'chalk';
import type Client from '../../util/client';
import { deleteRule } from '../../util/ai-gateway/rules';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayRulesDeleteTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-delete';
import { rulesDeleteSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';

export default async function remove(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesDeleteTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    rulesDeleteSubcommand.options
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
      output.error('To delete in non-interactive mode, re-run with --yes.');
      return 1;
    }
    const confirmed = await client.input.confirm(
      `Delete routing rule ${chalk.bold(ruleId)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const deleteStamp = stamp();
  output.spinner('Deleting routing rule');

  try {
    await deleteRule(client, ruleId);
    output.stopSpinner();
    output.success(
      `Routing rule ${chalk.bold(ruleId)} deleted ${deleteStamp()}`
    );
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
