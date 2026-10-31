import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import formatTable from '../../../util/format-table';
import { validateJsonOutput } from '../../../util/output-format';
import { validateLsArgs } from '../../../util/validate-ls-args';
import { getCommandName, getCommandNamePlain } from '../../../util/pkg-name';
import { TracesConfigLsTelemetryClient } from '../../../util/telemetry/commands/traces/config/ls';
import { lsSubcommand } from './command';
import { handleTracingApiError } from './errors';
import { writeConfigJson } from './json-output';
import {
  formatPath,
  formatRate,
  readTracingConfig,
  RULE_LIMIT,
  type SamplingRuleRow,
  subcommandArguments,
} from './rules';
import { resolveConfigScope } from './scope';

// Mirrors the argument names in the `set` help so the hint teaches the real
// command line.
const SET_HINT =
  'traces config set <rate> [requestPath] --environment <environment>';

function ruleCountLabel(count: number): string {
  return `${count} of ${RULE_LIMIT} rules`;
}

function printTable(projectName: string, rows: SamplingRuleRow[]): void {
  output.log(
    `Trace sampling rules for ${chalk.bold(projectName)} (${ruleCountLabel(rows.length)})`
  );
  output.print(
    `${formatTable(
      ['environment', 'path', 'rate'],
      ['l', 'l', 'l'],
      [
        {
          rows: rows.map(row => [
            row.environment,
            formatPath(row.requestPath),
            formatRate(row.sampleRate),
          ]),
        },
      ]
    )}\n`
  );
}

export default async function ls(client: Client): Promise<number> {
  const telemetry = new TracesConfigLsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(lsSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }
  const { flags } = parsedArgs;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionProject(flags['--project']);

  const argsResult = validateLsArgs({
    commandName: 'traces config ls',
    args: subcommandArguments(parsedArgs.args),
    maxArgs: 0,
    exitCode: 2,
  });
  if (argsResult !== 0) {
    return argsResult;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
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
  let enabled;
  let entries;
  try {
    ({ project, enabled, entries } = await readTracingConfig({
      client,
      ...scope,
    }));
  } catch (err: unknown) {
    output.stopSpinner();
    return handleTracingApiError(client, err);
  }
  output.stopSpinner();

  const rows: SamplingRuleRow[] = entries.map(entry => entry.row);

  const message =
    rows.length === 0
      ? `No trace sampling rules for ${project.name}.`
      : `Listed ${ruleCountLabel(rows.length)}.`;

  if (asJson) {
    writeConfigJson(client, {
      project,
      bare: rows,
      envelope: { rules: rows, enabled },
      message,
      next: [
        {
          command: getCommandNamePlain(SET_HINT),
          when: 'Add or replace a sampling rule',
        },
      ],
    });
    return 0;
  }

  if (!enabled) {
    output.log(`Tracing is disabled for ${chalk.bold(project.name)}.`);
  }

  if (rows.length === 0) {
    output.log(`No trace sampling rules for ${chalk.bold(project.name)}.`);
    output.dim(`Add one with ${getCommandName(SET_HINT)}`);
    return 0;
  }

  printTable(project.name, rows);
  return 0;
}
