import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { validateJsonOutput } from '../../../util/output-format';
import { getCommandName, getCommandNamePlain } from '../../../util/pkg-name';
import { buildCommandWithGlobalFlags } from '../../../util/agent-output';
import { quoteArg } from '../../../util/flags/quote-arg';
import { help } from '../../help';
import { TracesConfigRmTelemetryClient } from '../../../util/telemetry/commands/traces/config/rm';
import { tracesCommand } from '../command';
import { rmSubcommand } from './command';
import {
  confirmationRequired,
  handleTracingApiError,
  invalidArguments,
  ruleNotFound,
} from './errors';
import { writeConfigJson } from './json-output';
import {
  EMPTY_PATH_ERROR,
  ENVIRONMENT_ERROR,
  formatRuleLine,
  formatRuleTarget,
  isRuleEnvironment,
  readProjectTracing,
  RULE_LIMIT,
  type RuleEnvironment,
  type SamplingRuleEntry,
  type SamplingRuleRow,
  subcommandArguments,
  writeSamplingRules,
} from './rules';
import { resolveConfigScope } from './scope';

const USAGE = 'traces config rm <environment> [requestPath]';

/**
 * Which rules a `rm` invocation targets. The path axis has three states, and
 * they are not interchangeable: an explicit prefix names one rule, `--default`
 * names the single rule with no prefix, and neither means every rule in the
 * environment.
 */
type PathSelector =
  | { kind: 'exact'; requestPath: string }
  | { kind: 'default' }
  | { kind: 'every' };

function matches(
  row: SamplingRuleRow,
  environment: RuleEnvironment,
  selector: PathSelector
): boolean {
  if (row.environment !== environment) {
    return false;
  }
  switch (selector.kind) {
    case 'exact':
      return row.requestPath === selector.requestPath;
    case 'default':
      return row.requestPath === null;
    case 'every':
      return true;
  }
}

function describeSelection(
  environment: RuleEnvironment,
  selector: PathSelector
): string {
  switch (selector.kind) {
    case 'exact':
      return formatRuleTarget(environment, selector.requestPath);
    case 'default':
      return formatRuleTarget(environment, null);
    case 'every':
      return environment;
  }
}

function ruleWord(count: number): string {
  return count === 1 ? 'rule' : 'rules';
}

/**
 * Whether this session can put a prompt in front of a person.
 *
 * The three conditions are checked separately on purpose. `nonInteractive` is
 * only `--non-interactive`, or an agent that *also* has no TTY, so an agent
 * that shells out through a pty and a plain piped script both still read as
 * interactive to it. Either one would reach `input.confirm` and wait for an
 * answer that never arrives.
 */
function canConfirm(client: Client): boolean {
  return (
    !client.nonInteractive && !client.isAgent && client.stdin.isTTY === true
  );
}

/**
 * The same selection, as a command for a person to run in a terminal.
 *
 * Built from the parsed arguments rather than from argv, so the path prefix —
 * customer data, and the one token here that can carry shell metacharacters —
 * is quoted: a suggestion is copied into a shell, and `/api; rm -rf .` in one
 * would run as two commands.
 */
function commandToRunByHand(
  client: Client,
  environment: RuleEnvironment,
  pathArg: string | undefined,
  defaultFlag: boolean
): string {
  const template = [
    'traces config rm',
    environment,
    ...(pathArg !== undefined ? [quoteArg(pathArg)] : []),
    ...(defaultFlag ? ['--default'] : []),
  ].join(' ');
  return buildCommandWithGlobalFlags(client.argv, template, undefined, {
    // The command is for a terminal, so it must not carry the flag that says
    // there is nobody at one.
    excludeFlags: ['--non-interactive'],
    preserveProject: true,
  });
}

export default async function rm(client: Client): Promise<number> {
  const telemetry = new TracesConfigRmTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rmSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const [environmentArg, ...pathArgs] = subcommandArguments(parsedArgs.args);
  const pathArg = pathArgs[0];
  const defaultFlag = Boolean(flags['--default']);

  telemetry.trackCliArgumentEnvironment(environmentArg);
  telemetry.trackCliArgumentRequestPath(pathArg);
  telemetry.trackCliFlagDefault(flags['--default']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionProject(flags['--project']);

  if (environmentArg === undefined) {
    output.print(
      help(rmSubcommand, {
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

  if (pathArg !== undefined && defaultFlag) {
    return invalidArguments(
      client,
      '`--default` selects the rule that has no path prefix, so it cannot be combined with a path prefix.'
    );
  }

  if (pathArg !== undefined && pathArg.trim() === '') {
    return invalidArguments(client, EMPTY_PATH_ERROR);
  }

  const selector: PathSelector =
    pathArg !== undefined
      ? { kind: 'exact', requestPath: pathArg }
      : defaultFlag
        ? { kind: 'default' }
        : { kind: 'every' };

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

  if (!asJson) {
    output.spinner('Fetching trace sampling rules…');
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
  output.stopSpinner();

  const removed = entries
    .filter(entry => matches(entry.row, environmentArg, selector))
    .map(entry => entry.row);
  // The rules that stay are the objects the API sent, so nothing this command
  // was not asked to touch is rewritten by being written back.
  const kept = entries.filter(
    entry => !matches(entry.row, environmentArg, selector)
  );

  if (removed.length === 0) {
    // Nothing matched, so the project is never touched.
    return ruleNotFound(
      client,
      `No trace sampling rule matches ${describeSelection(environmentArg, selector)} on ${project.name}.`
    );
  }

  const removedLines = removed.map(formatRuleLine);

  // One `rm` can destroy up to ten rules and nothing records what they held
  // afterwards, so the list is printed before the prompt: it is both the thing
  // being consented to and the only trace the terminal keeps. It goes to
  // stderr, so `--json` stdout stays parseable.
  output.log(
    `The following ${removed.length} ${ruleWord(removed.length)} will be removed from ${chalk.bold(project.name)}:`
  );
  for (const line of removedLines) {
    output.print(`  ${line}\n`);
  }

  // A person answering the prompt is the only consent this command takes, so a
  // session that cannot prompt is refused rather than left waiting on an answer
  // that never arrives. The refusal waits until the rules have been read so it
  // can name every one at risk: the caller cannot finish the command, and that
  // list is what it needs to hand the job over.
  if (!canConfirm(client)) {
    return confirmationRequired(
      client,
      `Removing ${removed.length} trace sampling ${ruleWord(removed.length)} from ${project.name} needs a confirmation, and this session cannot prompt for one. Rules at risk: ${removedLines.join(', ')}.`,
      [
        {
          command: commandToRunByHand(
            client,
            environmentArg,
            pathArg,
            defaultFlag
          ),
          when: 'Run this in a terminal and answer the prompt',
        },
      ]
    );
  }

  const confirmed = await client.input.confirm(
    `Remove ${removed.length} trace sampling ${ruleWord(removed.length)}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled.');
    return 0;
  }

  if (!asJson) {
    output.spinner('Updating trace sampling rules…');
  }

  try {
    await writeSamplingRules({
      client,
      ...scope,
      tracing,
      rules: kept.map(entry => entry.rule),
    });
  } catch (err: unknown) {
    output.stopSpinner();
    return handleTracingApiError(client, err);
  }
  output.stopSpinner();

  const message = `Removed ${removed.length} trace sampling ${ruleWord(removed.length)} from ${project.name}. ${kept.length} of ${RULE_LIMIT} rules.`;

  if (asJson) {
    // `envelope` is what a non-interactive run would print, and a
    // non-interactive run cannot reach this line: the confirmation is
    // mandatory. It is passed anyway so the three subcommands keep one shape,
    // and so this tier is already correct if `rm` ever gains a scripted path.
    writeConfigJson(client, {
      project,
      bare: removed,
      envelope: { removed, ruleCount: kept.length, ruleLimit: RULE_LIMIT },
      message,
      next: [
        {
          command: getCommandNamePlain('traces config ls'),
          when: 'Read back every remaining sampling rule',
        },
      ],
    });
    return 0;
  }

  output.success(
    `Removed ${removed.length} trace sampling ${ruleWord(removed.length)} from ${chalk.bold(project.name)}. ${kept.length} of ${RULE_LIMIT} rules.`
  );
  return 0;
}
