import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { validateJsonOutput } from '../../../util/output-format';
import { getCommandName, getCommandNamePlain } from '../../../util/pkg-name';
import { help } from '../../help';
import { TracesConfigSetTelemetryClient } from '../../../util/telemetry/commands/traces/config/set';
import { tracesCommand } from '../command';
import { setSubcommand } from './command';
import { handleTracingApiError, invalidArguments } from './errors';
import { writeConfigJson } from './json-output';
import {
  EMPTY_PATH_ERROR,
  ENVIRONMENT_ERROR,
  formatRate,
  formatRuleTarget,
  hasSameKey,
  isRuleEnvironment,
  parseSampleRate,
  RATE_ERROR,
  readProjectTracing,
  RULE_LIMIT,
  type SamplingRuleEntry,
  type SamplingRuleRow,
  subcommandArguments,
  toApiRate,
  toRule,
  writeSamplingRules,
} from './rules';
import { resolveConfigScope } from './scope';

const USAGE = 'traces config set <environment> <rate> [requestPath]';

export default async function set(client: Client): Promise<number> {
  const telemetry = new TracesConfigSetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(setSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const [environmentArg, rateArg, ...pathArgs] = subcommandArguments(
    parsedArgs.args
  );
  const pathArg = pathArgs[0];

  telemetry.trackCliArgumentEnvironment(environmentArg);
  telemetry.trackCliArgumentRate(rateArg);
  telemetry.trackCliArgumentRequestPath(pathArg);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionProject(flags['--project']);

  if (environmentArg === undefined || rateArg === undefined) {
    output.print(
      help(setSubcommand, {
        parent: { ...tracesCommand, name: 'traces config' },
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  // An arg-count problem prints usage, so it exits 2 like every other usage
  // error in the group. A bad argument *value* below prints its own message and
  // exits 1.
  if (pathArgs.length > 1) {
    output.error(`Too many arguments. Usage: ${getCommandName(USAGE)}`);
    return 2;
  }

  if (!isRuleEnvironment(environmentArg)) {
    return invalidArguments(
      client,
      `${ENVIRONMENT_ERROR} Received: ${environmentArg}`
    );
  }

  const sampleRate = parseSampleRate(rateArg);
  if (sampleRate === undefined) {
    return invalidArguments(client, `${RATE_ERROR} Received: ${rateArg}`);
  }

  // Path format belongs to the platform; a CLI copy of those rules would
  // drift, so only emptiness is checked here.
  if (pathArg !== undefined && pathArg.trim() === '') {
    return invalidArguments(client, EMPTY_PATH_ERROR);
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const scope = await resolveConfigScope(client, {
    project: flags['--project'],
  });
  if ('exitCode' in scope) {
    return scope.exitCode;
  }

  const rule: SamplingRuleRow = {
    environment: environmentArg,
    requestPath: pathArg ?? null,
    sampleRate,
  };

  if (!asJson) {
    output.spinner('Updating trace sampling rules…');
  }

  let project;
  let tracing;
  let entries: SamplingRuleEntry[];
  try {
    ({ project, tracing, entries } = await readProjectTracing({
      client,
      ...scope,
    }));
  } catch (err: unknown) {
    output.stopSpinner();
    return handleTracingApiError(client, err);
  }

  const existingIndex = entries.findIndex(entry => hasSameKey(entry.row, rule));
  const previous =
    existingIndex === -1 ? undefined : entries[existingIndex].row;
  // Every rule the command did not name is sent back as the API returned it. A
  // replacement keeps its own object too, with only the rate changed: the key
  // it matched on is the environment and the path, so nothing else about the
  // rule was asked to change.
  const nextRules =
    existingIndex === -1
      ? [...entries.map(entry => entry.rule), toRule(rule)]
      : entries.map((entry, index) =>
          index === existingIndex
            ? { ...entry.rule, rate: toApiRate(rule.sampleRate) }
            : entry.rule
        );

  if (nextRules.length > RULE_LIMIT) {
    output.stopSpinner();
    return invalidArguments(
      client,
      `A project can have at most ${RULE_LIMIT} trace sampling rules, and ${project.name} already has ${entries.length}. Remove one with ${getCommandName('traces config rm <environment> [requestPath]')} first.`
    );
  }

  try {
    await writeSamplingRules({ client, ...scope, tracing, rules: nextRules });
  } catch (err: unknown) {
    output.stopSpinner();
    return handleTracingApiError(client, err);
  }
  output.stopSpinner();

  const target = formatRuleTarget(rule.environment, rule.requestPath);
  const wasClause = previous ? ` (was ${formatRate(previous.sampleRate)})` : '';
  // The old rate is printed so the change is reversible from the message alone.
  const successLine = (subject: string) =>
    `Set ${subject} to ${formatRate(rule.sampleRate)}${wasClause}. ${nextRules.length} of ${RULE_LIMIT} rules.`;

  if (asJson) {
    writeConfigJson(client, {
      project,
      bare: rule,
      envelope: {
        rule,
        previousSampleRate: previous?.sampleRate ?? null,
        ruleCount: nextRules.length,
        ruleLimit: RULE_LIMIT,
      },
      message: successLine(target),
      next: [
        {
          command: getCommandNamePlain('traces config ls'),
          when: 'Read back every sampling rule',
        },
      ],
    });
    return 0;
  }

  output.success(successLine(chalk.bold(target)));
  return 0;
}
