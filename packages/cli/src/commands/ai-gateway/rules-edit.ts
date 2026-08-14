import chalk from 'chalk';
import type Client from '../../util/client';
import { updateRule, type RuleAction } from '../../util/ai-gateway/rules';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayRulesEditTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-edit';
import { rulesEditSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function edit(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesEditTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rulesEditSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const [ruleId] = args;
  const enable = opts['--enable'] as boolean | undefined;
  const disable = opts['--disable'] as boolean | undefined;
  const destination = opts['--destination'] as string | undefined;
  const reason = opts['--reason'] as string | undefined;
  const description = opts['--description'] as string | undefined;

  telemetry.trackCliArgumentRuleId(ruleId);
  telemetry.trackCliFlagEnable(enable);
  telemetry.trackCliFlagDisable(disable);
  telemetry.trackCliOptionDestination(destination);
  telemetry.trackCliOptionReason(reason);
  telemetry.trackCliOptionDescription(description);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!ruleId) {
    output.error(
      `${getCommandName('ai-gateway rules edit <ruleId>')} expects a rule id.`
    );
    return 1;
  }
  if (enable && disable) {
    output.error('Pass only one of --enable or --disable.');
    return 1;
  }

  const action: RuleAction | undefined =
    destination || reason
      ? {
          ...(destination ? { rewriteModel: destination } : {}),
          ...(reason ? { reason } : {}),
        }
      : undefined;
  const enabled = enable ? true : disable ? false : undefined;

  if (enabled === undefined && description === undefined && !action) {
    output.error(
      'Nothing to edit. Pass --enable/--disable, --destination, --reason, or --description.'
    );
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const editStamp = stamp();
  output.spinner('Editing routing rule');

  try {
    const rule = await updateRule(client, {
      ruleId,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(action ? { action } : {}),
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(rule, null, 2)}\n`);
    } else {
      output.success(
        `Routing rule ${chalk.bold(rule.ruleId)} edited ${editStamp()}`
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
