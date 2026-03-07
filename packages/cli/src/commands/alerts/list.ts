import type Client from '../../util/client';
import ms from 'ms';
import table from '../../util/output/table';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { alertsCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';
import type { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';
import {
  type ValidationError,
  writeJsonError,
  normalizeRepeatableStringFilters,
  validateAllProjectMutualExclusivity,
  validateOptionalIntegerRange,
  validateTimeBound,
  validateTimeOrder,
} from '../../util/command-validation';

interface ListFlags {
  '--type'?: string[];
  '--project'?: string;
  '--all'?: boolean;
  '--since'?: string;
  '--until'?: string;
  '--limit'?: number;
  '--format'?: string;
}

interface AlertsScope {
  teamId: string;
  projectId?: string;
}

interface Ai {
  activityId?: string;
  version?: number;
  keyFindings?: string[];
  currentSummary?: string;
  title?: string;
  tilte?: string;
  level?: string;
}

interface Alert {
  id: string;
  teamId: string;
  projectId: string;
  type: string;
  pipe: string;
  status: string;
  level: string;
  startedAt: number;
  resolvedAt?: number;
  recordedStartedAt: number;
  recordedResolvedAt?: number;
  title?: string;
  ai?: Ai;
  data?: Record<string, unknown>;
  activatedAt?: string | number;
  route?: string;
  path?: string;
  requestPath?: string;
  dimensions?: {
    route?: string;
    path?: string;
    requestPath?: string;
  };
}

interface AlertGroup {
  teamId: string;
  projectId: string;
  id: string;
  pipe: string;
  level: string;
  type: string;
  status: string;
  recordedStartedAt: number;
  updatedAt?: number;
  validatedAt?: number;
  relatedGroupIds?: string[];
  ai?: Ai;
  alerts: Alert[];
}

function outputError(
  client: Client,
  jsonOutput: boolean,
  code: string,
  message: string
): number {
  if (jsonOutput) {
    writeJsonError(client, code, message);
    return 1;
  }
  output.error(message);
  return 1;
}

function handleValidationError(
  client: Client,
  jsonOutput: boolean,
  result: ValidationError
): number {
  return outputError(client, jsonOutput, result.code, result.message);
}

function getDefaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function resolveScope(
  client: Client,
  opts: { project?: string; all?: boolean }
): Promise<AlertsScope | number> {
  if (opts.all || opts.project) {
    const { team } = await getScope(client);
    if (!team) {
      output.error(
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.'
      );
      return 1;
    }

    if (opts.all) {
      return {
        teamId: team.id,
      };
    }

    let projectResult: Awaited<ReturnType<typeof getProjectByNameOrId>>;
    try {
      projectResult = await getProjectByNameOrId(
        client,
        opts.project!,
        team.id
      );
    } catch (err) {
      if (isAPIError(err)) {
        output.error(
          err.serverMessage ||
            (err.status === 403
              ? `You do not have permission to access project "${opts.project}" in team "${team.slug}".`
              : `API error (${err.status}).`)
        );
        return 1;
      }
      throw err;
    }

    if (projectResult instanceof ProjectNotFound) {
      output.error(
        `Project "${opts.project}" was not found in team "${team.slug}".`
      );
      return 1;
    }

    return {
      teamId: team.id,
      projectId: projectResult.id,
    };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  if (linkedProject.status === 'not_linked') {
    output.error(
      'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.'
    );
    return 1;
  }

  return {
    teamId: linkedProject.org.id,
    projectId: linkedProject.project.id,
  };
}

function getGroupTitle(group: AlertGroup): string {
  return (
    group.ai?.title ||
    group.ai?.tilte ||
    group.alerts?.[0]?.ai?.title ||
    group.alerts?.[0]?.ai?.tilte ||
    group.alerts?.[0]?.title ||
    'Alert group'
  );
}

function parseDateInput(value?: string | number): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(epochMs);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== '') {
    const epochMs = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(epochMs);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateForDisplay(value?: string | number): string {
  const date = parseDateInput(value);
  if (!date) {
    return '-';
  }

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
}

function getStartedAt(group: AlertGroup): string {
  return formatDateForDisplay(
    group.recordedStartedAt ||
      group.alerts?.[0]?.startedAt ||
      group.alerts?.[0]?.activatedAt
  );
}

function getStatus(group: AlertGroup): string {
  const normalizedStatus = (group.status || '').toLowerCase();
  if (normalizedStatus === 'active') {
    return 'active';
  }

  if (normalizedStatus === 'resolved') {
    const startedAt = parseDateInput(group.recordedStartedAt);
    const resolvedCandidates = group.alerts
      .map(alert => parseDateInput(alert.resolvedAt))
      .filter((d): d is Date => Boolean(d))
      .map(d => d.getTime());
    const resolvedAt =
      resolvedCandidates.length > 0
        ? new Date(Math.max(...resolvedCandidates))
        : undefined;

    if (
      startedAt &&
      resolvedAt &&
      resolvedAt.getTime() >= startedAt.getTime()
    ) {
      return `resolved after ${ms(resolvedAt.getTime() - startedAt.getTime())}`;
    }

    return 'resolved';
  }

  return group.status || '-';
}

function getAlertsCount(group: AlertGroup): string {
  return String(group.alerts?.length ?? 0);
}

function printGroups(groups: AlertGroup[]) {
  if (groups.length === 0) {
    output.log('No alerts found.');
    return;
  }

  for (const group of groups) {
    if (group.ai) {
      output.debug(
        `group ${group.id} ai: ${JSON.stringify(group.ai, null, 2)}`
      );
    }
  }

  const rows = [
    ['Title', 'StartedAt', 'Type', 'Status', 'Alerts'],
    ...groups.map(group => [
      getGroupTitle(group),
      getStartedAt(group),
      group.type || '-',
      getStatus(group),
      getAlertsCount(group),
    ]),
  ];

  const tableOutput = table(rows, { hsep: 3 })
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/^/gm, '  ');
  output.print(`\n${tableOutput}\n`);
}

export default async function list(
  client: Client,
  telemetry: AlertsTelemetryClient
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags as ListFlags;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const types = normalizeRepeatableStringFilters(flags['--type']);
  telemetry.trackCliOptionType(types.length > 0 ? types : undefined);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagAll(flags['--all']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionFormat(flags['--format']);

  const limitResult = validateOptionalIntegerRange(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 1000,
  });
  if (!limitResult.valid) {
    return handleValidationError(client, jsonOutput, limitResult);
  }

  const mutualResult = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutualResult.valid) {
    return handleValidationError(client, jsonOutput, mutualResult);
  }

  const sinceResult = validateTimeBound(flags['--since']);
  if (!sinceResult.valid) {
    return handleValidationError(client, jsonOutput, sinceResult);
  }

  const untilResult = validateTimeBound(flags['--until']);
  if (!untilResult.valid) {
    return handleValidationError(client, jsonOutput, untilResult);
  }

  const timeOrderResult = validateTimeOrder(
    sinceResult.value,
    untilResult.value
  );
  if (!timeOrderResult.valid) {
    return handleValidationError(client, jsonOutput, timeOrderResult);
  }

  const scope = await resolveScope(client, {
    project: flags['--project'],
    all: flags['--all'],
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const query = new URLSearchParams({
    teamId: scope.teamId,
  });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }
  if (limitResult.value) {
    query.set('limit', String(limitResult.value));
  }
  for (const type of types) {
    query.append('types', type);
  }
  if (sinceResult.value) {
    query.set('from', sinceResult.value.toISOString());
  }
  if (untilResult.value) {
    query.set('to', untilResult.value.toISOString());
  }
  if (!sinceResult.value && !untilResult.value) {
    const defaultRange = getDefaultRange();
    query.set('from', defaultRange.from);
    query.set('to', defaultRange.to);
  }

  const requestPath = `/alerts/v3/groups?${query.toString()}`;
  output.debug(`Fetching alerts from ${requestPath}`);

  try {
    const groups = await client.fetch<AlertGroup[]>(requestPath);

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify({ groups }, null, 2)}\n`);
    } else {
      printGroups(groups);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const message =
        err.status === 401 || err.status === 403
          ? 'You do not have access to alerts in this scope. Pass --token <TOKEN> and --scope <team-slug> with Alerts read access.'
          : err.status >= 500
            ? `The alerts endpoint failed on the server (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
            : err.serverMessage || `API error (${err.status}).`;
      if (jsonOutput) {
        writeJsonError(client, err.code || 'API_ERROR', message);
        return 1;
      }
      output.error(message);
      return 1;
    }

    output.debug(err);
    const message = `Failed to fetch alerts: ${(err as Error).message || String(err)}`;
    if (jsonOutput) {
      writeJsonError(client, 'UNEXPECTED_ERROR', message);
      return 1;
    }
    output.error(message);
    return 1;
  }
}
