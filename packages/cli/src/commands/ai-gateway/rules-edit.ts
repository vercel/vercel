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
import { readOnOffOption } from '../../util/on-off-option';

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
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const [ruleId] = args;
  const destination = opts['--destination'] as string | undefined;
  const reason = opts['--reason'] as string | undefined;
  const description = opts['--description'] as string | undefined;

  telemetry.trackCliArgumentRuleId(ruleId);
  telemetry.trackCliFlagEnable(opts['--enable']);
  telemetry.trackCliFlagNoEnable(opts['--no-enable']);
  telemetry.trackCliFlagDisable(opts['--disable']);
  telemetry.trackCliOptionDestination(destination);
  telemetry.trackCliOptionReason(reason);
  telemetry.trackCliOptionDescription(description);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  if (!ruleId) {
    output.error(
      `${getCommandName('ai-gateway rules update <ruleId>')} expects a rule id.`
    );
    return 2;
  }
  const enable = readOnOffOption(client, opts, {
    on: '--enable',
    off: '--no-enable',
    oldOff: '--disable',
  });
  if ('error' in enable) {
    output.error(enable.error);
    return 2;
  }

  const action: RuleAction | undefined =
    destination || reason
      ? {
          ...(destination ? { rewriteModel: destination } : {}),
          ...(reason ? { reason } : {}),
        }
      : undefined;
  const enabled = enable.value;

  if (enabled === undefined && description === undefined && !action) {
    output.error(
      'Nothing to edit. Pass --enable, --no-enable, --destination, --reason, or --description.'
    );
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const editStamp = stamp();
  output.spinner('Updating routing rule');

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
        `Routing rule ${chalk.bold(rule.ruleId)} updated ${editStamp()}`
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
