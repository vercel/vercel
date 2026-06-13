import chalk from 'chalk';
import type Client from '../../util/client';
import { updateRule, type RuleAction } from '../../util/ai-gateway/rules';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayRulesUpdateTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-update';
import { rulesUpdateSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function update(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    rulesUpdateSubcommand.options
  );
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
  const rewriteModel = opts['--rewrite-model'] as string | undefined;
  const reason = opts['--reason'] as string | undefined;
  const description = opts['--description'] as string | undefined;

  telemetry.trackCliArgumentRuleId(ruleId);
  telemetry.trackCliFlagEnable(enable);
  telemetry.trackCliFlagDisable(disable);
  telemetry.trackCliOptionRewriteModel(rewriteModel);
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
      `${getCommandName('ai-gateway rules update <ruleId>')} expects a rule id.`
    );
    return 1;
  }
  if (enable && disable) {
    output.error('Pass only one of --enable or --disable.');
    return 1;
  }

  const action: RuleAction | undefined =
    rewriteModel || reason
      ? {
          ...(rewriteModel ? { rewriteModel } : {}),
          ...(reason ? { reason } : {}),
        }
      : undefined;
  const enabled = enable ? true : disable ? false : undefined;

  if (enabled === undefined && description === undefined && !action) {
    output.error(
      'Nothing to update. Pass --enable/--disable, --rewrite-model, --reason, or --description.'
    );
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const updateStamp = stamp();
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
        `Routing rule ${chalk.bold(rule.ruleId)} updated ${updateStamp()}`
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
