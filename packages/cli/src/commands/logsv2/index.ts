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
const DATE_TIME_FORMAT = 'MMM DD HH:mm:ss.SS';

interface ColumnDef<T> {
  label: string;
  padding?: [number, number];
  width?: number | 'stretch';
  getValue: (row: T) => string;
  format?: (paddedValue: string, row: T) => string;
}

interface TableOptions<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  tableWidth: number;
  formatHeader?: (formattedHeader: string) => string;
  formatRow?: (formattedRow: string, row: T) => string;
}

function table<T>({
  columns,
  rows,
  tableWidth,
  formatHeader,
  formatRow,
}: TableOptions<T>): { header: string; rows: string[] } {
  const zeroPad: [number, number] = [0, 0];

  // Calculate max content width for each column
  const maxWidths = columns.map(col => {
    const headerWidth = col.label.length;
    const maxContent = Math.max(
      headerWidth,
      ...rows.map(row => col.getValue(row).length)
    );
    return maxContent;
  });

  // Calculate final widths
  const colPaddings: [number, number][] = columns.map(
    col => col.padding ?? zeroPad
  );
  const finalWidths: number[] = [];
  let usedWidth = 0;
  let stretchIndex = -1;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const padding = colPaddings[i][0] + colPaddings[i][1];

    if (col.width === 'stretch') {
      stretchIndex = i;
      finalWidths.push(0);
    } else if (typeof col.width === 'number') {
      finalWidths.push(col.width);
      usedWidth += col.width + padding;
    } else {
      finalWidths.push(maxWidths[i]);
      usedWidth += maxWidths[i] + padding;
    }
  }

  // Add separator space between columns (2 spaces)
  usedWidth += (columns.length - 1) * 2;

  // Fill stretch column
  if (stretchIndex >= 0) {
    const stretchPadding =
      colPaddings[stretchIndex][0] + colPaddings[stretchIndex][1];
    finalWidths[stretchIndex] = Math.max(
      10,
      tableWidth - usedWidth - stretchPadding
    );
  }

  // Pad and truncate a value to fit width
  const pad = (value: string, width: number): string => {
    if (value.length > width) {
      return value.slice(0, width - 1) + '…';
    }
    return value.padEnd(width);
  };

  // Build header
  const headerStr = columns
    .map((col, i) => {
      const padded = pad(col.label, finalWidths[i]);
      return (
        ' '.repeat(colPaddings[i][0]) + padded + ' '.repeat(colPaddings[i][1])
      );
    })
    .join('  ');
  const header = formatHeader ? formatHeader(headerStr) : headerStr;

  // Build rows
  const formattedRows = rows.map(row => {
    const rowStr = columns
      .map((col, i) => {
        const value = col.getValue(row);
        const padded = pad(value, finalWidths[i]);
        const formatted = col.format ? col.format(padded, row) : padded;
        return (
          ' '.repeat(colPaddings[i][0]) +
          formatted +
          ' '.repeat(colPaddings[i][1])
        );
      })
      .join('  ');
    return formatRow ? formatRow(rowStr, row) : rowStr;
  });

  return { header, rows: formattedRows };
}

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
  let projectName: string;
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
    projectName = project.name;
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
    projectName = link.project.name;
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
        `Streaming logs for deployment ${chalk.bold(deploymentId)} starting from ${chalk.bold(format(Date.now(), TIME_ONLY_FORMAT))}\n\n`
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
      output.print(chalk.dim(`No logs found for ${projectName}\n`));
    } else {
      const showDate = logsSpanMultipleDays(logs);
      const timeFormat = showDate ? DATE_TIME_FORMAT : TIME_ONLY_FORMAT;

      // Build row data
      type RowData = {
        time: string;
        level: string;
        path: string;
        status: string;
        statusCode: number;
        message: string;
        messageTruncated?: boolean;
      };

      const rowData: RowData[] = logs.map(log => {
        const statusCode = log.responseStatusCode;
        return {
          time: format(log.timestamp, timeFormat),
          level: log.level,
          path: `${getSourceIcon(log.source)} ${log.requestMethod} ${log.requestPath}`,
          status: !statusCode || statusCode <= 0 ? '---' : String(statusCode),
          statusCode,
          message: log.message?.replace(/\n/g, ' ').trim() || '',
          messageTruncated: log.messageTruncated,
        };
      });

      // Define columns with formatting
      const baseColumns: ColumnDef<RowData>[] = [
        {
          label: 'TIME',
          getValue: row => row.time,
          format: padded => chalk.dim(padded),
        },
        {
          label: 'LEVEL',
          getValue: row => row.level,
          format: (padded, row) => colorizeLevel(padded, row.level),
        },
        {
          label: '',
          padding: [0, 3],
          getValue: row => row.path,
        },
      ];

      const columns: ColumnDef<RowData>[] = expandOption
        ? baseColumns
        : [
            ...baseColumns,
            {
              label: 'STATUS',
              getValue: row => row.status,
              format: (padded, row) =>
                row.statusCode <= 0
                  ? chalk.gray(padded)
                  : colorizeStatus(padded, row.statusCode),
            },
            {
              label: 'MESSAGE',
              width: 'stretch',
              getValue: row => row.message || '(no message)',
              format: (padded, row) =>
                row.message
                  ? colorizeMessage(padded, row.level)
                  : chalk.dim(padded),
            },
          ];

      const formatted = table({
        columns,
        rows: rowData,
        tableWidth: terminalWidth,
        formatHeader: header => chalk.dim(header),
        formatRow: expandOption
          ? (rowStr, row) => {
              if (row.message) {
                const coloredMessage = colorizeMessage(row.message, row.level);
                const truncatedIndicator = row.messageTruncated
                  ? chalk.gray('…')
                  : '';
                return `${rowStr}\n${coloredMessage}${truncatedIndicator}\n`;
              }
              return rowStr + '\n';
            }
          : undefined,
      });

      // Print header
      output.print(formatted.header + '\n');

      // Print rows
      for (const row of formatted.rows) {
        output.print(row + '\n');
      }

      output.print(
        chalk.gray(`Fetched ${logs.length} logs for ${projectName}\n`)
      );
    }
  }

  return 0;
}

function colorizeLevel(formatted: string, level: string): string {
  switch (level) {
    case 'fatal':
      return chalk.red.bold(formatted);
    case 'error':
      return chalk.red(formatted);
    case 'warning':
      return chalk.yellow(formatted);
    default:
      return chalk.dim(formatted);
  }
}

function colorizeStatus(formatted: string, statusCode: number): string {
  if (statusCode >= 500) {
    return chalk.red(formatted);
  } else if (statusCode >= 400) {
    return chalk.yellow(formatted);
  } else if (statusCode >= 300) {
    return chalk.cyan(formatted);
  } else if (statusCode >= 200) {
    return chalk.green(formatted);
  }
  return chalk.gray(formatted);
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'serverless':
    case 'lambda':
      return 'λ';
    case 'edge-function':
    case 'edge-middleware':
    case 'middleware':
      return 'ε';
    case 'static':
    case 'external':
    case 'redirect':
      return '◇';
    default:
      return ' ';
  }
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
