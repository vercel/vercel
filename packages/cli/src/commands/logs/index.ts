import { isErrnoException } from '@vercel/error-utils';
import type { Deployment } from '@vercel-internals/types';
import chalk from 'chalk';
import format from 'date-fns/format';
import type Client from '../../util/client';
import { createGitMeta } from '../../util/create-git-meta';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope, { detectExplicitScope } from '../../util/get-scope';
import { formatProject } from '../../util/projects/format-project';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { getLinkedProject } from '../../util/projects/link';
import {
  DeploymentNotFound,
  InvalidDeploymentId,
  ProjectNotFound,
} from '../../util/errors-ts';
import { displayRuntimeLogs } from '../../util/logs';
import {
  fetchAllRequestLogs,
  type RequestLogEntry,
  type RequestLogMessage,
} from '../../util/logs-v2';
import getDeployment from '../../util/get-deployment';
import getUser from '../../util/get-user';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { LogsTelemetryClient } from '../../util/telemetry/commands/logs';
import { help } from '../help';
import { logsCommand } from './command';
import output from '../../output-manager';

interface LatestDeployment {
  id: string;
  url: string;
}

interface DeploymentResponse {
  deployments: Array<{ uid: string; url: string }>;
}

type LogsTargetSource = 'deployment' | 'explicit-project' | 'linked-project';

interface LogsTarget {
  projectId: string;
  projectSlug: string;
  orgSlug: string;
  ownerId: string;
  deployment?: Deployment;
  targetSource: LogsTargetSource;
}

interface ResolveLogsTargetOptions {
  contextName: string;
  deploymentOption?: string;
  projectOption?: string;
}

type ResolveLogsTargetResult = LogsTarget | { exitCode: number };

async function getLatestDeployment(
  client: Client,
  projectId: string,
  filters: { branch?: string; userId?: string; target?: string } = {}
): Promise<LatestDeployment | null> {
  const query = new URLSearchParams();
  query.set('projectId', projectId);
  query.set('limit', '1');
  query.set('state', 'READY');
  if (filters.branch) {
    query.set('branch', filters.branch);
  }
  if (filters.userId) {
    query.set('users', filters.userId);
  }
  if (filters.target) {
    query.set('target', filters.target);
  }

  const { deployments } = await client.fetch<DeploymentResponse>(
    `/v6/deployments?${query}`
  );

  if (deployments.length === 0) {
    return null;
  }

  return {
    id: deployments[0].uid,
    url: deployments[0].url,
  };
}

interface ResolveBranchFilterOptions {
  client: Client;
  explicitBranch?: string;
  logsTarget: LogsTarget;
  noBranch?: boolean;
}

async function resolveBranchFilter({
  client,
  explicitBranch,
  logsTarget,
  noBranch,
}: ResolveBranchFilterOptions): Promise<string | undefined> {
  if (explicitBranch) {
    return explicitBranch;
  }

  if (
    noBranch ||
    logsTarget.deployment ||
    logsTarget.targetSource !== 'linked-project'
  ) {
    return;
  }

  try {
    const gitMeta = await createGitMeta(client.cwd);
    if (gitMeta?.commitRef) {
      output.debug(`Detected git branch: ${gitMeta.commitRef}`);
      return gitMeta.commitRef;
    }
  } catch {
    // Not in a git repo or git not available, continue without branch filter
  }
}

interface ResolveFollowDeploymentOptions {
  branch?: string;
  client: Client;
  environment?: string;
  logsTarget: LogsTarget;
}

type ResolveFollowDeploymentResult =
  | { deploymentId: string; label: string }
  | { exitCode: number };

async function resolveFollowDeployment({
  branch,
  client,
  environment,
  logsTarget,
}: ResolveFollowDeploymentOptions): Promise<ResolveFollowDeploymentResult> {
  const { deployment, orgSlug, projectId, projectSlug } = logsTarget;

  if (deployment?.id) {
    return { deploymentId: deployment.id, label: 'deployment' };
  }

  if (environment === 'production') {
    output.spinner('Finding latest production deployment', 1000);
    const productionDeployment = await getLatestDeployment(client, projectId, {
      target: 'production',
    });
    output.stopSpinner();

    if (!productionDeployment) {
      output.error(
        `No READY production deployments found for ${formatProject(orgSlug, projectSlug)}. Deploy to production first or specify a deployment with ${chalk.bold('--deployment')}.`
      );
      return { exitCode: 1 };
    }

    output.debug(
      `Found latest production deployment ${productionDeployment.id} (${productionDeployment.url})`
    );
    return {
      deploymentId: productionDeployment.id,
      label: 'latest production deployment',
    };
  }

  const target = environment;

  if (branch) {
    output.spinner(`Finding latest deployment for branch "${branch}"`, 1000);
    const branchDeployment = await getLatestDeployment(client, projectId, {
      branch,
      target,
    });
    output.stopSpinner();

    if (branchDeployment) {
      output.debug(
        `Found deployment ${branchDeployment.id} for branch ${branch}`
      );
      return {
        deploymentId: branchDeployment.id,
        label: `latest deployment on branch "${branch}"`,
      };
    }

    output.debug(`No deployments found for branch "${branch}"`);
  }

  const user = await getUser(client);
  output.spinner('Finding your latest deployment', 1000);
  const userDeployment = await getLatestDeployment(client, projectId, {
    userId: user.id,
    target,
  });
  output.stopSpinner();

  if (userDeployment) {
    output.debug(
      `Found latest deployment ${userDeployment.id} (${userDeployment.url}) created by current user`
    );
    return {
      deploymentId: userDeployment.id,
      label: 'your latest deployment',
    };
  }

  if (environment === 'preview') {
    output.error(
      `No READY preview deployments found for ${formatProject(orgSlug, projectSlug)}. Deploy a preview first or specify a deployment with ${chalk.bold('--deployment')}.`
    );
    return { exitCode: 1 };
  }

  output.spinner('Finding latest production deployment', 1000);
  const productionDeployment = await getLatestDeployment(client, projectId, {
    target: 'production',
  });
  output.stopSpinner();

  if (!productionDeployment) {
    output.error(
      `No READY deployments found for ${formatProject(orgSlug, projectSlug)}. Deploy first or specify a deployment with ${chalk.bold('--deployment')}.`
    );
    return { exitCode: 1 };
  }

  output.debug(
    `Found latest production deployment ${productionDeployment.id} (${productionDeployment.url})`
  );
  return {
    deploymentId: productionDeployment.id,
    label: 'latest production deployment',
  };
}

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

function isNonLiveTerminalDeployment(deployment: Deployment): boolean {
  return (
    deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED'
  );
}

// Both forms wrap the command in backticks. `plain: true` uses literal
// backticks with no color (suitable for embedding in JSON output); the default
// uses gray backticks and cyan text for terminal display.
function getInspectCommand(
  deployment: Deployment,
  contextName?: string,
  { plain = false }: { plain?: boolean } = {}
): string {
  const scopeOption = contextName ? ` --scope ${contextName}` : '';
  const command = `inspect https://${deployment.url}${scopeOption}`;
  return plain
    ? `\`${getCommandNamePlain(command)}\``
    : getCommandName(command);
}

function printNonLiveDeploymentError(
  deployment: Deployment,
  contextName?: string
): void {
  const inspectCommand = getInspectCommand(deployment, contextName);
  output.error(
    `Logs are unavailable because deployment ${chalk.bold(
      deployment.id
    )} never reached READY and ended in ${deployment.readyState}.\n` +
      `Run ${inspectCommand} for deployment details.`
  );
}

async function resolveLogsTarget(
  client: Client,
  { contextName, deploymentOption, projectOption }: ResolveLogsTargetOptions
): Promise<ResolveLogsTargetResult> {
  if (deploymentOption) {
    output.spinner(`Resolving deployment "${deploymentOption}"`, 1000);
    let deployment: Awaited<ReturnType<typeof getDeployment>>;
    try {
      deployment = await getDeployment(client, contextName, deploymentOption);
    } catch (err) {
      if (err instanceof DeploymentNotFound) {
        output.error(
          `Deployment not found: ${deploymentOption} under ${chalk.bold(
            contextName
          )}`
        );
        return { exitCode: 1 };
      }
      if (err instanceof InvalidDeploymentId) {
        output.error(`Invalid deployment ID: ${deploymentOption}`);
        return { exitCode: 1 };
      }
      throw err;
    } finally {
      output.stopSpinner();
    }

    if (!deployment.projectId) {
      output.error('Deployment is not associated with a project.');
      return { exitCode: 1 };
    }

    // `getDeployment()` already resolved under `client.config.currentTeam` via
    // `client.fetch()`, and project/log lookups should stay in that same scope.
    output.spinner(`Fetching project "${deployment.projectId}"`, 1000);
    const project = await getProjectByIdOrName(client, deployment.projectId);
    output.stopSpinner();

    if (project instanceof ProjectNotFound) {
      output.error(
        `Project not found: ${deployment.projectId} under ${chalk.bold(
          contextName
        )}`
      );
      return { exitCode: 1 };
    }

    if (projectOption) {
      output.spinner(`Fetching project "${projectOption}"`, 1000);
      const explicitProject = await getProjectByIdOrName(client, projectOption);
      output.stopSpinner();

      if (explicitProject instanceof ProjectNotFound) {
        output.error(
          `Project not found: ${projectOption} under ${chalk.bold(contextName)}`
        );
        return { exitCode: 1 };
      }

      if (explicitProject.id !== project.id) {
        output.error(
          `The deployment "${deploymentOption}" does not belong to "${projectOption}" project. Remove either the deployment selection or the ${chalk.bold(
            '--project'
          )} option.`
        );
        return { exitCode: 1 };
      }
    }

    return {
      projectId: project.id,
      projectSlug: project.name,
      orgSlug: contextName,
      ownerId: project.accountId,
      deployment,
      targetSource: 'deployment',
    };
  }

  if (projectOption) {
    output.spinner(`Fetching project "${projectOption}"`, 1000);
    const project = await getProjectByIdOrName(client, projectOption);
    output.stopSpinner();

    if (project instanceof ProjectNotFound) {
      output.error(
        `Project not found: ${projectOption} under ${chalk.bold(contextName)}`
      );
      return { exitCode: 1 };
    }

    return {
      projectId: project.id,
      projectSlug: project.name,
      orgSlug: contextName,
      ownerId: project.accountId,
      targetSource: 'explicit-project',
    };
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return { exitCode: link.exitCode };
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin, or specify a project with ${chalk.bold('--project')}.`
    );
    return { exitCode: 1 };
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return {
    projectId: link.project.id,
    projectSlug: link.project.name,
    orgSlug: link.org.slug,
    ownerId: link.org.id,
    targetSource: 'linked-project',
  };
}

export default async function logs(client: Client) {
  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(logsCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    output.print(help(logsCommand, { columns: client.stderr.columns }));
    return 1;
  }

  const telemetry = new LogsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('logs');
    output.print(help(logsCommand, { columns: client.stderr.columns }));
    return 0;
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
  const queryOption = parsedArguments.flags['--query'];
  const searchOption = parsedArguments.flags['--search'];
  const requestIdOption = parsedArguments.flags['--request-id'];
  const expandOption = parsedArguments.flags['--expand'];
  const branchFlagValue = parsedArguments.flags['--branch'];

  const noFollowFlagValue = parsedArguments.flags['--no-follow'];
  const followOption = parsedArguments.flags['--follow'];

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
  telemetry.trackCliFlagNoFollow(noFollowFlagValue);
  telemetry.trackCliOptionQuery(queryOption);
  telemetry.trackCliOptionSearch(searchOption);
  telemetry.trackCliOptionRequestId(requestIdOption);
  telemetry.trackCliFlagExpand(expandOption);
  telemetry.trackCliOptionBranch(branchFlagValue);

  if (followOption) {
    const incompatibleFlags = [
      { flag: '--level', value: levelOption },
      { flag: '--status-code', value: statusCodeOption },
      { flag: '--source', value: sourceOption },
      { flag: '--since', value: sinceOption },
      { flag: '--until', value: untilOption },
      { flag: '--limit', value: limitOption },
      { flag: '--query', value: queryOption },
      { flag: '--search', value: searchOption },
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

  let contextName: string;

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

  const logsTarget = await resolveLogsTarget(client, {
    contextName,
    deploymentOption,
    projectOption,
  });
  if ('exitCode' in logsTarget) {
    return logsTarget.exitCode;
  }

  const { projectId, projectSlug, orgSlug, ownerId, deployment } = logsTarget;
  const deploymentId = deployment?.id;

  if (deployment && isNonLiveTerminalDeployment(deployment)) {
    const inspectContextName = detectExplicitScope(client)
      ? contextName
      : undefined;
    const inspectCommand = getInspectCommand(deployment, inspectContextName, {
      plain: true,
    });

    if (jsonOption) {
      client.stdout.write(
        `${JSON.stringify({
          type: 'deployment_error',
          message: `Logs are unavailable because deployment ${deployment.id} never reached READY and ended in ${deployment.readyState}. Run ${inspectCommand} for deployment details.`,
        })}\n`
      );
    } else {
      printNonLiveDeploymentError(deployment, inspectContextName);
    }
    return 1;
  }

  // Determine branch filter:
  // - If --branch is explicitly set (string), use it
  // - If --no-branch is set, don't filter by branch
  // - Otherwise, auto-detect the current git branch only for a linked project
  const noBranchFlagValue = parsedArguments.flags['--no-branch'];
  const branchOption = await resolveBranchFilter({
    client,
    explicitBranch:
      typeof branchFlagValue === 'string' ? branchFlagValue : undefined,
    logsTarget,
    noBranch: noBranchFlagValue,
  });

  if (
    environmentOption &&
    !['production', 'preview'].includes(environmentOption)
  ) {
    output.error(
      `Invalid environment: ${environmentOption}. Must be "production" or "preview".`
    );
    return 1;
  }

  if (followOption) {
    const followDeployment = await resolveFollowDeployment({
      branch: branchOption,
      client,
      environment: environmentOption,
      logsTarget,
    });
    if ('exitCode' in followDeployment) {
      return followDeployment.exitCode;
    }

    if (!jsonOption) {
      output.print(
        `Streaming logs for ${followDeployment.label} ${chalk.bold(followDeployment.deploymentId)} starting from ${chalk.bold(format(Date.now(), TIME_ONLY_FORMAT))}\n\n`
      );
    }
    const abortController = new AbortController();
    return await displayRuntimeLogs(
      client,
      {
        deploymentId: followDeployment.deploymentId,
        projectId,
        parse: !jsonOption,
      },
      abortController
    );
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

  // Non-interactive consumers (agents, pipes, CI) get full log messages by
  // default, as if --expand was passed
  const expand = expandOption || !client.stderr.isTTY;

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
      search: searchOption ?? queryOption,
      requestId: requestIdOption,
      branch: branchOption,
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
    const branchSuffix = branchOption
      ? ` on branch ${chalk.cyan(branchOption)}`
      : '';
    if (logs.length === 0) {
      output.print(
        chalk.dim(
          `No logs found for ${formatProject(orgSlug, projectSlug)}${branchSuffix}\n`
        )
      );
    } else {
      const showDate = logsSpanMultipleDays(logs);
      const timeFormat = showDate ? DATE_TIME_FORMAT : TIME_ONLY_FORMAT;

      // Build row data
      type RowData = {
        time: string;
        host: string;
        level: string;
        path: string;
        status: string;
        statusCode: number;
        message: string;
        messageTruncated?: boolean;
        logs: RequestLogMessage[];
      };

      const rowData: RowData[] = logs.map(log => {
        const statusCode = log.responseStatusCode;
        return {
          time: format(log.timestamp, timeFormat),
          host: log.domain || '',
          level: log.level,
          path: `${getSourceIcon(log.source)} ${log.requestMethod} ${log.requestPath}`,
          status: !statusCode || statusCode <= 0 ? '---' : String(statusCode),
          statusCode,
          message: log.message?.replace(/\n/g, ' ').trim() || '',
          messageTruncated: log.messageTruncated,
          logs: log.logs,
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
          label: 'HOST',
          getValue: row => row.host,
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

      const columns: ColumnDef<RowData>[] = expand
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
        formatRow: expand
          ? (rowStr, row) => {
              if (row.logs.length > 0) {
                const renderedLogs = row.logs
                  .map(log => {
                    const message = log.message.replace(/\n/g, ' ').trim();
                    const safeMessage = message || '(no message)';
                    const truncatedIndicator = log.messageTruncated
                      ? chalk.gray('…')
                      : '';
                    return `${colorizeMessage(safeMessage, log.level)}${truncatedIndicator}`;
                  })
                  .join('\n');
                return `${rowStr}\n${renderedLogs}\n`;
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
        chalk.gray(
          `Fetched ${logs.length} logs for ${formatProject(orgSlug, projectSlug)}${branchSuffix}\n`
        )
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
