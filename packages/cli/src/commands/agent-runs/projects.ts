import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import { projectsSubcommand } from './command';
import {
  fetchAgentRuns,
  handleAgentRunsApiError,
  invalidArguments,
  resolveAgentRunsScope,
} from './agent-runs-api';
import {
  asArray,
  formatCount,
  formatDurationMs,
  readNumber,
  readString,
} from './format';
import { AgentProjectsTelemetryClient } from '../../util/telemetry/commands/agent-runs/projects';

export default async function projects(client: Client): Promise<number> {
  const telemetry = new AgentProjectsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(projectsSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    '--environment': environment,
    '--since': since,
    '--until': until,
    '--json': json,
    '--scope': scopeFlag,
  } = parsedArgs.flags;

  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliFlagJson(json);

  if (until && !since) {
    return invalidArguments(client, '`--until` requires `--since`.');
  }

  const scope = await resolveAgentRunsScope(client, {
    scopeFlag,
    projectFlag: undefined,
    requireProject: false,
  });
  if (!scope.ok) {
    return scope.exitCode;
  }

  const fetchStamp = stamp();
  output.spinner(
    `Fetching projects with Agent Runs in ${chalk.bold(scope.contextName)}…`
  );
  let data;
  try {
    data = await fetchAgentRuns(client, {
      teamId: scope.teamId,
      view: 'team',
      environment,
      since,
      until,
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

  const projectList = asArray(data.projects ?? data.items);
  if (projectList.length === 0) {
    output.log('No projects with Agent Runs activity found.');
    return 0;
  }

  output.log(
    `Projects with Agent Runs under ${chalk.bold(scope.contextName)} ${fetchStamp()}`
  );

  const rows = [
    ['Project', 'Runs', 'Avg Duration'].map(header =>
      chalk.bold(chalk.cyan(header))
    ),
    ...projectList.map(project => [
      chalk.bold(
        readString(
          project,
          'projectName',
          'name',
          'project',
          'projectId',
          'id'
        ) ?? '-'
      ),
      formatCount(readNumber(project, 'runs', 'runCount', 'totalRuns')),
      chalk.gray(
        formatDurationMs(
          readNumber(
            project,
            'avgDurationMs',
            'averageDurationMs',
            'avgDuration'
          )
        )
      ),
    ]),
  ];
  client.stdout.write(`\n${table(rows, { hsep: 3 }).replace(/^/gm, '  ')}\n\n`);
  output.log(
    `Run ${cmd('vercel agent-runs list --project <name>')} to list its Agent Runs.`
  );
  return 0;
}
