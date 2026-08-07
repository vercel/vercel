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
import { AiGatewayRulesAddTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-add';
import { rulesAddSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

const RULE_TYPES: RuleType[] = ['rewrite', 'deny'];

export default async function add(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rulesAddSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const type = opts['--type'] as string | undefined;
  const source = opts['--source'] as string | undefined;
  const destination = opts['--destination'] as string | undefined;
  const reason = opts['--reason'] as string | undefined;
  const description = opts['--description'] as string | undefined;

  telemetry.trackCliOptionType(type);
  telemetry.trackCliOptionSource(source);
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

  if (!type || !RULE_TYPES.includes(type as RuleType)) {
    output.error(
      `The --type flag is required and must be one of: ${RULE_TYPES.join(', ')}.`
    );
    return 1;
  }
  if (!source) {
    output.error('The --source flag is required (the model the rule matches).');
    return 1;
  }
  if (type === 'rewrite' && !destination) {
    output.error(
      'A rewrite rule requires --destination (the model to route to).'
    );
    return 1;
  }
  if (type === 'deny' && destination) {
    output.error('A deny rule cannot set --destination.');
    return 1;
  }

  let action: RuleAction | undefined;
  if (type === 'rewrite' && destination) {
    action = { rewriteModel: destination, ...(reason ? { reason } : {}) };
  } else if (reason) {
    action = { reason };
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const addStamp = stamp();
  output.spinner('Adding routing rule');

  try {
    const rule = await createRule(client, {
      type: type as RuleType,
      match: { model: source },
      ...(action ? { action } : {}),
      ...(description ? { description } : {}),
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(rule, null, 2)}\n`);
    } else {
      client.stdout.write(`${rule.ruleId}\n`);
      output.success(
        `Routing rule ${chalk.bold(rule.ruleId)} added ${addStamp()}`
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
