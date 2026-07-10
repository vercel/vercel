import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import { issuesSubcommand } from './command';
import {
  fetchAgentRuns,
  handleAgentRunsApiError,
  invalidArguments,
  resolveAgentRunsScope,
} from './agent-runs-api';
import {
  asArray,
  formatAge,
  formatCount,
  readNumber,
  readString,
  readTimestampMs,
  type UnknownRecord,
} from './format';
import { AgentIssuesTelemetryClient } from '../../util/telemetry/commands/agent-runs/issues';

const ISSUE_TYPE_LABEL: Record<string, string> = {
  action_failed: 'Action failed',
  action_rejected: 'Action rejected',
  step_failed: 'Step failed',
  turn_failed: 'Turn failed',
  session_failed: 'Session failed',
};

function formatIssueType(group: UnknownRecord): string {
  const raw = readString(group, 'type');
  return raw ? (ISSUE_TYPE_LABEL[raw] ?? raw) : '-';
}

function formatIssueCode(group: UnknownRecord): string {
  return readString(group, 'code') ?? '-';
}

function formatIssueTool(group: UnknownRecord): string {
  return readString(group, 'tool') ?? '-';
}

export default async function issues(client: Client): Promise<number> {
  const telemetry = new AgentIssuesTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(issuesSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    '--project': projectFlag,
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--issue-code': issueCode,
    '--issue-type': issueType,
    '--issue-source': issueSource,
    '--issue-tool': issueTool,
    '--trigger': trigger,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }
  if (
    issueType &&
    issueType !== 'action_failed' &&
    issueType !== 'action_rejected' &&
    issueType !== 'step_failed' &&
    issueType !== 'turn_failed' &&
    issueType !== 'session_failed'
  ) {
    return invalidArguments(
      client,
      '`--issue-type` supports `action_failed`, `action_rejected`, `step_failed`, `turn_failed`, or `session_failed`.'
    );
  }
  const validatedIssueType =
    issueType === 'action_failed' ||
    issueType === 'action_rejected' ||
    issueType === 'step_failed' ||
    issueType === 'turn_failed' ||
    issueType === 'session_failed'
      ? issueType
      : undefined;
  if (
    issueSource &&
    issueSource !== 'remote_subagent' &&
    issueSource !== 'skill' &&
    issueSource !== 'subagent' &&
    issueSource !== 'tool' &&
    issueSource !== 'workflow'
  ) {
    return invalidArguments(
      client,
      '`--issue-source` supports `remote_subagent`, `skill`, `subagent`, `tool`, or `workflow`.'
    );
  }
  const validatedIssueSource =
    issueSource === 'remote_subagent' ||
    issueSource === 'skill' ||
    issueSource === 'subagent' ||
    issueSource === 'tool' ||
    issueSource === 'workflow'
      ? issueSource
      : undefined;
  if (
    trigger &&
    trigger !== 'slack' &&
    trigger !== 'http' &&
    trigger !== 'schedule' &&
    trigger !== 'manual' &&
    trigger !== 'unknown'
  ) {
    return invalidArguments(
      client,
      '`--trigger` supports `slack`, `http`, `schedule`, `manual`, or `unknown`.'
    );
  }
  const validatedTrigger =
    trigger === 'slack' ||
    trigger === 'http' ||
    trigger === 'schedule' ||
    trigger === 'manual' ||
    trigger === 'unknown'
      ? trigger
      : undefined;

  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionIssueCode(issueCode);
  telemetry.trackCliOptionIssueType(validatedIssueType);
  telemetry.trackCliOptionIssueSource(validatedIssueSource);
  telemetry.trackCliOptionIssueTool(issueTool);
  telemetry.trackCliOptionTrigger(validatedTrigger);
  telemetry.trackCliFlagJson(json);

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag,
    requireProject: true,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  const fetchStamp = stamp();
  output.spinner(
    `Fetching Agent Run issues in ${chalk.bold(scope.contextName)}…`
  );
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      projectId: scope.projectId,
      environment,
      since,
      until,
      issueCode,
      issueType: validatedIssueType,
      issueSource: validatedIssueSource,
      issueTool,
      trigger: validatedTrigger,
      groupBy: 'issue',
    });
  } catch (err) {
    output.stopSpinner();
    handleAgentRunsApiError(client, err);
    return 1;
  }
  output.stopSpinner();

  if (json) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  const issueGroups = asArray(data.issueGroups);
  if (issueGroups.length === 0) {
    output.log('No Agent Run issues found.');
    return 0;
  }

  output.log(
    `Agent Run issues under ${chalk.bold(scope.contextName)} ${fetchStamp()}`
  );

  const rows = [
    [
      'Type',
      'Tool',
      'Code',
      'Occurrences',
      'Runs',
      'Last Seen',
      'Sample Run',
    ].map(header => chalk.bold(chalk.cyan(header))),
    ...issueGroups.map(group => [
      formatIssueType(group),
      formatIssueTool(group),
      formatIssueCode(group),
      formatCount(
        readNumber(group, 'occurrences') ?? readNumber(group, 'turns')
      ),
      formatCount(readNumber(group, 'runs')),
      chalk.gray(formatAge(readTimestampMs(group, 'lastSeenAt'))),
      chalk.bold(readString(group, 'sampleRunId') ?? '-'),
    ]),
  ];
  client.stdout.write(`\n${table(rows, { hsep: 3 }).replace(/^/gm, '  ')}\n\n`);

  output.log(
    `Run ${cmd('vercel agent-runs list --issue error --project <name>')} to list issue-bearing runs.`
  );
  return 0;
}
