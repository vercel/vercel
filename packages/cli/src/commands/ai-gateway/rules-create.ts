import chalk from 'chalk';
import type Client from '../../util/client';
import {
  createRule,
  type RuleAction,
  type RuleType,
} from '../../util/ai-gateway/rules';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayRulesCreateTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-create';
import { rulesCreateSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

const RULE_TYPES: RuleType[] = ['rewrite', 'deny'];

export default async function create(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    rulesCreateSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const type = opts['--type'] as string | undefined;
  const model = opts['--model'] as string | undefined;
  const rewriteModel = opts['--rewrite-model'] as string | undefined;
  const reason = opts['--reason'] as string | undefined;
  const description = opts['--description'] as string | undefined;

  telemetry.trackCliOptionType(type);
  telemetry.trackCliOptionModel(model);
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

  if (!type || !RULE_TYPES.includes(type as RuleType)) {
    output.error(
      `The --type flag is required and must be one of: ${RULE_TYPES.join(', ')}.`
    );
    return 1;
  }
  if (!model) {
    output.error('The --model flag is required (the model the rule matches).');
    return 1;
  }
  if (type === 'rewrite' && !rewriteModel) {
    output.error(
      'A rewrite rule requires --rewrite-model (the model to route to).'
    );
    return 1;
  }
  if (type === 'deny' && rewriteModel) {
    output.error('A deny rule cannot set --rewrite-model.');
    return 1;
  }

  let action: RuleAction | undefined;
  if (type === 'rewrite' && rewriteModel) {
    action = { rewriteModel, ...(reason ? { reason } : {}) };
  } else if (reason) {
    action = { reason };
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const createStamp = stamp();
  output.spinner('Creating routing rule');

  try {
    const rule = await createRule(client, {
      type: type as RuleType,
      match: { model },
      ...(action ? { action } : {}),
      ...(description ? { description } : {}),
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(rule, null, 2)}\n`);
    } else {
      client.stdout.write(`${rule.ruleId}\n`);
      output.success(
        `Routing rule ${chalk.bold(rule.ruleId)} created ${createStamp()}`
      );
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
