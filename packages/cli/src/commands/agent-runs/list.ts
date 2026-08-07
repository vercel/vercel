import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import { listSubcommand } from './command';
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
  formatDurationMs,
  formatRunStatus,
  readNumber,
  readRecord,
  runDurationMs,
  runId,
  runModel,
  runStartedAtMs,
  runTotalTokens,
  runTrigger,
} from './format';
import { AgentRunsListTelemetryClient } from '../../util/telemetry/commands/agent-runs/list';

export default async function list(client: Client): Promise<number> {
  const telemetry = new AgentRunsListTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
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
    '--search': search,
    '--page': page,
    '--limit': limit,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionSearch(search);
  telemetry.trackCliOptionPage(page);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliFlagJson(json);

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag,
    requireProject: true,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  const fetchStamp = stamp();
  output.spinner(`Fetching Agent Runs in ${chalk.bold(scope.contextName)}…`);
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      projectId: scope.projectId,
      environment,
      since,
      until,
      page,
      pageSize: limit,
      search,
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

  const runList = asArray(data.runs);
  if (runList.length === 0) {
    if (search || since) {
      output.log('No Agent Runs match the current filters.');
    } else {
      output.log('No Agent Runs found.');
    }
    return 0;
  }

  output.log(
    `Agent Runs under ${chalk.bold(scope.contextName)} ${fetchStamp()}`
  );

  const rows = [
    ['Run ID', 'Status', 'Trigger', 'Model', 'Tokens', 'Duration', 'Age'].map(
      header => chalk.bold(chalk.cyan(header))
    ),
    ...runList.map(run => [
      chalk.bold(runId(run)),
      formatRunStatus(run),
      runTrigger(run),
      runModel(run),
      formatCount(runTotalTokens(run)),
      chalk.gray(formatDurationMs(runDurationMs(run))),
      chalk.gray(formatAge(runStartedAtMs(run))),
    ]),
  ];
  client.stdout.write(`\n${table(rows, { hsep: 3 }).replace(/^/gm, '  ')}\n\n`);

  const pagination = readRecord(data, 'pagination');
  const total = readNumber(pagination, 'total', 'totalCount');
  if (total !== undefined && total > runList.length) {
    const nextPageArgs = [
      'vercel agent-runs list',
      scopeFlag ? `--scope ${scopeFlag}` : '',
      projectFlag ? `--project ${projectFlag}` : '',
      `--page ${(page ?? 1) + 1}`,
    ]
      .filter(Boolean)
      .join(' ');
    output.log(
      `Showing ${runList.length} of ${total} Agent Runs. Run ${cmd(nextPageArgs)} for more.`
    );
  }
  output.log(
    `Run ${cmd('vercel agent-runs inspect <runId>')} for run details.`
  );
  return 0;
}
