import { isErrnoException } from '@vercel/error-utils';
import chalk from 'chalk';
import { format } from 'date-fns';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { getLinkedProject } from '../../util/projects/link';
import {
  DeploymentNotFound,
  InvalidDeploymentId,
  ProjectNotFound,
} from '../../util/errors-ts';
import { displayRuntimeLogs } from '../../util/logs';
import { fetchAllRequestLogs, type RequestLogEntry } from '../../util/logs-v2';
import getDeployment from '../../util/get-deployment';
import { getCommandName } from '../../util/pkg-name';
import { Logsv2TelemetryClient } from '../../util/telemetry/commands/logsv2';
import { help } from '../help';
import { logsv2Command } from './command';
import output from '../../output-manager';

const TIME_ONLY_FORMAT = 'HH:mm:ss.SS';
const DATE_TIME_FORMAT = 'MMM dd HH:mm:ss';

const COL_TIME_ONLY = 11;
const COL_TIME_WITH_DATE = 15;
const COL_LEVEL = 5;
const COL_SOURCE = 1;
const COL_STATUS = 6;

function logsSpanMultipleDays(logs: RequestLogEntry[]): boolean {
  if (logs.length === 0) return false;
  const firstDay = new Date(logs[0].timestamp).toDateString();
  return logs.some(log => new Date(log.timestamp).toDateString() !== firstDay);
}

function parseLevels(levels?: string | string[]): string[] {
  if (!levels) return [];
  if (typeof levels === 'string') return [levels];
  return levels;
}

function parseSources(sources?: string | string[]): string[] {
  if (!sources) return [];
  if (typeof sources === 'string') return [sources];
  return sources;
}

export default async function logsv2(client: Client) {
  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(logsv2Command.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new Logsv2TelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('logsv2');
    output.print(help(logsv2Command, { columns: client.stderr.columns }));
    return 2;
  }

  const subArgs = parsedArguments.args.slice(1);
  const [deploymentArgument] = subArgs;

  const projectOption = parsedArguments.flags['--project'];
  const deploymentFlag = parsedArguments.flags['--deployment'];
  const environmentOption = parsedArguments.flags['--environment'];

  let deploymentOption: string | undefined = deploymentFlag;
  if (deploymentArgument) {
    let deploymentIdOrHost = deploymentArgument;
    try {
      deploymentIdOrHost = new URL(deploymentArgument).hostname;
    } catch {}
    deploymentOption = deploymentIdOrHost;
  }
  const levelOption = parsedArguments.flags['--level'];
  const statusCodeOption = parsedArguments.flags['--status-code'];
  const sourceOption = parsedArguments.flags['--source'];
  const sinceOption = parsedArguments.flags['--since'];
  const untilOption = parsedArguments.flags['--until'];
  const limitOption = parsedArguments.flags['--limit'];
  const jsonOption = parsedArguments.flags['--json'];
  const followOption = parsedArguments.flags['--follow'];
  const queryOption = parsedArguments.flags['--query'];
  const requestIdOption = parsedArguments.flags['--request-id'];
  const expandOption = parsedArguments.flags['--expand'];

  telemetry.trackCliArgumentUrlOrDeploymentId(deploymentArgument);
  telemetry.trackCliOptionProject(projectOption);
  telemetry.trackCliOptionDeployment(deploymentFlag);
  telemetry.trackCliOptionEnvironment(environmentOption);
  telemetry.trackCliOptionLevel(levelOption);
  telemetry.trackCliOptionStatusCode(statusCodeOption);
  telemetry.trackCliOptionSource(sourceOption);
  telemetry.trackCliOptionSince(sinceOption);
  telemetry.trackCliOptionUntil(untilOption);
  telemetry.trackCliOptionLimit(limitOption);
  telemetry.trackCliFlagJson(jsonOption);
  telemetry.trackCliFlagFollow(followOption);
  telemetry.trackCliOptionQuery(queryOption);
  telemetry.trackCliOptionRequestId(requestIdOption);
  telemetry.trackCliFlagExpand(expandOption);

  if (followOption) {
    if (!deploymentOption) {
      output.error(
        `The ${chalk.bold('--follow')} flag requires a deployment URL or ID to be specified.`
      );
      return 1;
    }

    const incompatibleFlags = [
      { flag: '--environment', value: environmentOption },
      { flag: '--level', value: levelOption },
      { flag: '--status-code', value: statusCodeOption },
      { flag: '--source', value: sourceOption },
      { flag: '--since', value: sinceOption },
      { flag: '--until', value: untilOption },
      { flag: '--limit', value: limitOption },
      { flag: '--query', value: queryOption },
      { flag: '--request-id', value: requestIdOption },
    ];

    const usedIncompatible = incompatibleFlags
      .filter(f => f.value !== undefined && f.value !== null)
      .map(f => chalk.bold(f.flag));

    if (usedIncompatible.length > 0) {
      output.error(
        `The ${chalk.bold('--follow')} flag does not support filtering. Remove: ${usedIncompatible.join(', ')}`
      );
      return 1;
    }
  }

  let contextName: string | null = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  let projectId: string;
  let ownerId: string;

  if (projectOption) {
    output.spinner(`Fetching project "${projectOption}"`, 1000);
    const project = await getProjectByIdOrName(
      client,
      projectOption,
      client.config.currentTeam
    );
    output.stopSpinner();

    if (project instanceof ProjectNotFound) {
      output.error(`Project not found: ${projectOption}`);
      return 1;
    }
    projectId = project.id;
    ownerId = project.accountId;
  } else {
    const link = await getLinkedProject(client);
    if (link.status === 'error') {
      return link.exitCode;
    } else if (link.status === 'not_linked') {
      output.error(
        `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
          'link'
        )} to begin, or specify a project with ${chalk.bold('--project')}.`
      );
      return 1;
    }
    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
    projectId = link.project.id;
    ownerId = link.org.id;
  }

  let deploymentId: string | undefined;
  if (deploymentOption) {
    output.spinner(`Resolving deployment "${deploymentOption}"`, 1000);
    try {
      const deployment = await getDeployment(
        client,
        contextName!,
        deploymentOption
      );
      deploymentId = deployment.id;
      output.stopSpinner();
    } catch (err) {
      output.stopSpinner();
      if (err instanceof DeploymentNotFound) {
        output.error(`Deployment not found: ${deploymentOption}`);
        return 1;
      }
      if (err instanceof InvalidDeploymentId) {
        output.error(`Invalid deployment ID: ${deploymentOption}`);
        return 1;
      }
      throw err;
    }
  }

  if (followOption) {
    if (!jsonOption) {
      output.print(
        `Streaming logs for deployment ${chalk.bold(deploymentId)} starting from ${chalk.bold(format(Date.now(), TIME_FORMAT))}\n\n`
      );
    }
    const abortController = new AbortController();
    return await displayRuntimeLogs(
      client,
      {
        deploymentId: deploymentId!,
        projectId,
        parse: !jsonOption,
      },
      abortController
    );
  }

  if (
    environmentOption &&
    !['production', 'preview'].includes(environmentOption)
  ) {
    output.error(
      `Invalid environment: ${environmentOption}. Must be "production" or "preview".`
    );
    return 1;
  }

  const validLevels = ['error', 'warning', 'info', 'fatal'];
  const levels = parseLevels(levelOption);
  for (const level of levels) {
    if (!validLevels.includes(level)) {
      output.error(
        `Invalid log level: ${level}. Must be one of: ${validLevels.join(', ')}.`
      );
      return 1;
    }
  }

  const validSources = [
    'serverless',
    'edge-function',
    'edge-middleware',
    'static',
  ];
  const sources = parseSources(sourceOption);
  for (const source of sources) {
    if (!validSources.includes(source)) {
      output.error(
        `Invalid source: ${source}. Must be one of: ${validSources.join(', ')}.`
      );
      return 1;
    }
  }

  const limit = limitOption ?? 100;

  if (!jsonOption) {
    output.print(
      `Fetching logs for project ${chalk.bold(projectId)} in ${chalk.bold(contextName)}...\n\n`
    );
  }

  output.spinner('Fetching logs...', 1000);

  const terminalWidth = client.stderr.isTTY
    ? client.stderr.columns || 120
    : 120;

  const logs: RequestLogEntry[] = [];
  try {
    for await (const log of fetchAllRequestLogs(client, {
      projectId,
      ownerId,
      deploymentId,
      environment: environmentOption,
      level: levels.length > 0 ? levels : undefined,
      statusCode: statusCodeOption,
      source: sources.length > 0 ? sources : undefined,
      since: sinceOption,
      until: untilOption,
      limit,
      search: queryOption,
      requestId: requestIdOption,
    })) {
      output.stopSpinner();
      if (jsonOption) {
        client.stdout.write(JSON.stringify(log) + '\n');
      } else {
        logs.push(log);
      }
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  output.stopSpinner();

  if (!jsonOption) {
    if (logs.length === 0) {
      output.print(
        chalk.gray('No logs found matching the specified filters.\n')
      );
    } else {
      const maxMethodWidth = Math.max(...logs.map(l => l.requestMethod.length));
      const showDate = logsSpanMultipleDays(logs);
      const printOpts: PrintOptions = {
        expand: expandOption,
        terminalWidth,
        methodWidth: maxMethodWidth,
        showDate,
      };
      printHeader(printOpts);
      for (const log of logs) {
        prettyPrintLogEntry(log, printOpts);
      }
      output.print(chalk.gray(`\nDisplayed ${logs.length} log entries.\n`));
    }
  }

  return 0;
}

interface PrintOptions {
  expand?: boolean;
  terminalWidth?: number;
  methodWidth?: number;
  showDate?: boolean;
}

function printHeader(options: PrintOptions) {
  const { expand, showDate } = options;
  const colTime = showDate ? COL_TIME_WITH_DATE : COL_TIME_ONLY;
  const cols: string[] = [];

  cols.push((showDate ? 'DATE/TIME' : 'TIME').padEnd(colTime));
  cols.push('LEVEL'.padEnd(COL_LEVEL));
  cols.push('PATH');

  if (expand) {
    output.print(chalk.dim(cols.join('  ') + '\n'));
  } else {
    cols.push('STATUS'.padEnd(COL_STATUS));
    cols.push('MESSAGE');
    output.print(chalk.dim(cols.join('  ') + '\n'));
  }
}

function prettyPrintLogEntry(log: RequestLogEntry, options: PrintOptions = {}) {
  const { expand, terminalWidth = 120, methodWidth = 4, showDate } = options;

  const timeFormat = showDate ? DATE_TIME_FORMAT : TIME_ONLY_FORMAT;
  const colTime = showDate ? COL_TIME_WITH_DATE : COL_TIME_ONLY;
  const time = format(log.timestamp, timeFormat);
  const level = getLevelLabel(log.level);
  const source = getSourceIcon(log.source);
  const method = log.requestMethod.padEnd(methodWidth);
  const pathPart = `${source} ${method} ${log.requestPath}`;

  const statusCode = log.responseStatusCode;
  const statusStr = !statusCode || statusCode <= 0 ? '---' : String(statusCode);
  const status =
    !statusCode || statusCode <= 0
      ? chalk.gray(statusStr.padEnd(COL_STATUS))
      : getStatusColor(statusCode, COL_STATUS);

  if (expand) {
    const cols = [chalk.dim(time), level, pathPart];
    output.print(cols.join('  ') + '\n');
    if (log.message) {
      const message = log.message.replace(/\n$/, '');
      const coloredMessage = colorizeMessage(message, log.level);
      const truncatedIndicator = log.messageTruncated ? chalk.gray('…') : '';
      output.print(`${coloredMessage}${truncatedIndicator}\n\n`);
    } else {
      output.print('\n');
    }
  } else {
    const fixedWidth =
      colTime + COL_LEVEL + COL_SOURCE + methodWidth + COL_STATUS + 10;
    const msgWidth = Math.max(
      terminalWidth - fixedWidth - log.requestPath.length,
      20
    );
    const msg = log.message
      ? colorizeMessage(
          `"${truncateMessage(log.message, msgWidth - 2)}"`,
          log.level
        )
      : chalk.dim('(no message)');

    const cols = [chalk.dim(time), level, pathPart, status, msg];
    output.print(cols.join('  ') + '\n');
  }
}

function getLevelLabel(level: string): string {
  switch (level) {
    case 'fatal':
      return chalk.red.bold('fatal');
    case 'error':
      return chalk.red('error');
    case 'warning':
      return chalk.yellow('warn ');
    default:
      return chalk.dim('info ');
  }
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'serverless':
      return 'λ';
    case 'edge-function':
    case 'edge-middleware':
      return 'ε';
    case 'static':
      return '◇';
    default:
      return ' ';
  }
}

function getStatusColor(status: number, padWidth = 0): string {
  const statusStr =
    padWidth > 0 ? String(status).padEnd(padWidth) : String(status);
  if (status >= 500) {
    return chalk.red(statusStr);
  } else if (status >= 400) {
    return chalk.yellow(statusStr);
  } else if (status >= 300) {
    return chalk.cyan(statusStr);
  } else if (status >= 200) {
    return chalk.green(statusStr);
  }
  return chalk.gray(statusStr);
}

function truncateMessage(msg: string, maxLen = 60): string {
  const oneLine = msg.replace(/\n/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen - 1) + '…';
}

function colorizeMessage(message: string, level: string): string {
  switch (level) {
    case 'fatal':
    case 'error':
      return chalk.red(message);
    case 'warning':
      return chalk.yellow(message);
    default:
      return chalk.dim(message);
  }
}
