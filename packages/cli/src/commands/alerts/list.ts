import type Client from '../../util/client';
import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { alertsCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { getLinkedProject } from '../../util/projects/link';
import { resolveScopeContext } from '../../util/scope-context';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';
import type { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';
import {
  outputError,
  handleValidationError,
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
  '--ai'?: boolean;
  '--since'?: string;
  '--until'?: string;
  '--limit'?: number;
  '--format'?: string;
}

interface AlertsScope {
  teamId: string;
  projectId?: string;
}

type ValidatedInputs = {
  limit: number | undefined;
  types: string[];
  since: Date | undefined;
  until: Date | undefined;
};

interface Ai {
  activityId: string;
  version?: number;
  keyFindings?: string[];
  currentSummary?: string;
  title?: string;
  level?: string;
}

interface Alert {
  id?: string;
  teamId?: string;
  projectId?: string;
  type: string;
  pipe?: string;
  status: string;
  level?: string;
  startedAt: number;
  resolvedAt?: number;
  recordedStartedAt?: number;
  recordedResolvedAt?: number;
  ai?: Ai;
  data?: Record<string, unknown>;
}

interface AlertGroup {
  teamId: string;
  projectId: string;
  id: string;
  pipe?: string;
  level?: string;
  type?: string;
  status?: string;
  recordedStartedAt?: number;
  updatedAt?: number;
  validatedAt?: number;
  version?: number;
  relatedGroupIds?: string[];
  ai?: Ai;
  alerts?: Alert[];
}

function handleApiError(
  err: { status: number; code?: string; serverMessage?: string },
  jsonOutput: boolean,
  client: Client
): number {
  const message =
    err.status === 401 || err.status === 403
      ? 'You do not have access to alerts in this scope. Pass --token <TOKEN> and --scope <team-slug> with Alerts read access.'
      : err.status >= 500
        ? `The alerts endpoint failed on the server (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
        : err.serverMessage || `API error (${err.status}).`;

  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

function getDefaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function resolveScope(
  client: Client,
  opts: { project?: string; all?: boolean; jsonOutput: boolean }
): Promise<AlertsScope | number> {
  if (opts.all || opts.project) {
    const { team } = await resolveScopeContext(client, {
      requiresTeamOnly: true,
    });
    if (!team) {
      return outputError(
        client,
        opts.jsonOutput,
        'NO_TEAM',
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.'
      );
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
        return outputError(
          client,
          opts.jsonOutput,
          err.code || 'API_ERROR',
          err.serverMessage ||
            (err.status === 403
              ? `You do not have permission to access project "${opts.project}" in team "${team.slug}".`
              : `API error (${err.status}).`)
        );
      }
      throw err;
    }

    if (projectResult instanceof ProjectNotFound) {
      return outputError(
        client,
        opts.jsonOutput,
        'PROJECT_NOT_FOUND',
        `Project "${opts.project}" was not found in team "${team.slug}".`
      );
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
    return outputError(
      client,
      opts.jsonOutput,
      'NOT_LINKED',
      'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.'
    );
  }

  return {
    teamId: linkedProject.org.id,
    projectId: linkedProject.project.id,
  };
}

function getGroupTitle(group: AlertGroup): string {
  return group.ai?.title || 'Alert group';
}

function parseDateInput(value?: number): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateForDisplay(value?: number): string {
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
  return formatDateForDisplay(getGroupStartedAt(group)?.getTime());
}

function getGroupStartedAt(group: AlertGroup): Date | undefined {
  return (
    parseDateInput(group.recordedStartedAt) ||
    parseDateInput(group.alerts?.[0]?.startedAt)
  );
}

function getGroupResolvedAt(group: AlertGroup): Date | undefined {
  const resolvedTimes = (group.alerts ?? [])
    .map(alert => parseDateInput(alert.resolvedAt))
    .filter((d): d is Date => Boolean(d))
    .map(d => d.getTime());

  if (resolvedTimes.length > 0) {
    return new Date(Math.max(...resolvedTimes));
  }

  return getGroupStartedAt(group);
}

function getStatus(group: AlertGroup): string {
  const normalizedStatus = (group.status || '').toLowerCase();
  if (normalizedStatus === 'active') {
    return 'active';
  }

  if (normalizedStatus === 'resolved') {
    const startedAt = getGroupStartedAt(group);
    const resolvedAt = getGroupResolvedAt(group);

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

function getResolvedAt(group: AlertGroup): string {
  const normalizedStatus = (group.status || '').toLowerCase();
  if (normalizedStatus === 'active') {
    return 'active';
  }

  return formatDateForDisplay(getGroupResolvedAt(group)?.getTime());
}

function getAlertsCount(group: AlertGroup): string {
  return String(group.alerts?.length ?? 0);
}

function printGroups(groups: AlertGroup[]) {
  if (groups.length === 0) {
    output.log('No alerts found.');
    return;
  }

  const headers = ['Title', 'Started At', 'Type', 'Status', 'Alerts'].map(h =>
    chalk.cyan(h)
  );

  const rows = [
    headers,
    ...groups.map(group => [
      chalk.bold(getGroupTitle(group)),
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

function printAiSections(groups: AlertGroup[]) {
  if (groups.length === 0) {
    output.log('No alerts found.');
    return;
  }

  const rendered = groups
    .map(group => {
      const title = getGroupTitle(group);
      const summary = group.ai?.currentSummary || 'N/A';
      const findings = group.ai?.keyFindings?.filter(Boolean) ?? [];
      const findingsOutput =
        findings.length > 0
          ? findings.map(finding => `  - ${finding}`).join('\n')
          : '  - N/A';

      return [
        chalk.bold(title),
        `   ${chalk.cyan('Resolved At:')} ${getResolvedAt(group)}`,
        `   ${chalk.cyan('Summary:')} ${summary}`,
        `   ${chalk.cyan('Key Findings:')}`,
        findingsOutput,
      ].join('\n');
    })
    .join('\n\n');

  output.print(`\n${rendered}\n`);
}

function trackTelemetry(
  flags: ListFlags,
  types: string[],
  telemetry: AlertsTelemetryClient
) {
  telemetry.trackCliOptionType(types.length > 0 ? types : undefined);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagAll(flags['--all']);
  telemetry.trackCliFlagAi(flags['--ai']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionFormat(flags['--format']);
}

function parseFlags(client: Client): ListFlags | number {
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);

  try {
    const parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
    return parsedArgs.flags as ListFlags;
  } catch (err) {
    printError(err);
    return 1;
  }
}

function resolveValidatedInputs(
  flags: ListFlags,
  client: Client,
  jsonOutput: boolean
): ValidatedInputs | number {
  const types = normalizeRepeatableStringFilters(flags['--type']);

  const limitResult = validateOptionalIntegerRange(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
  });
  if (!limitResult.valid) {
    return handleValidationError(limitResult, jsonOutput, client);
  }

  const mutualResult = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }

  const sinceResult = validateTimeBound(flags['--since']);
  if (!sinceResult.valid) {
    return handleValidationError(sinceResult, jsonOutput, client);
  }

  const untilResult = validateTimeBound(flags['--until']);
  if (!untilResult.valid) {
    return handleValidationError(untilResult, jsonOutput, client);
  }

  const timeOrderResult = validateTimeOrder(
    sinceResult.value,
    untilResult.value
  );
  if (!timeOrderResult.valid) {
    return handleValidationError(timeOrderResult, jsonOutput, client);
  }

  return {
    limit: limitResult.value,
    types,
    since: sinceResult.value,
    until: untilResult.value,
  };
}

function buildAlertsQuery(
  scope: AlertsScope,
  inputs: ValidatedInputs
): URLSearchParams {
  const query = new URLSearchParams({
    teamId: scope.teamId,
  });

  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }
  if (inputs.limit) {
    query.set('limit', String(inputs.limit));
  }
  for (const type of inputs.types) {
    query.append('types', type);
  }
  if (inputs.since) {
    query.set('from', inputs.since.toISOString());
  }
  if (inputs.until) {
    query.set('to', inputs.until.toISOString());
  }
  if (!inputs.since && !inputs.until) {
    const defaultRange = getDefaultRange();
    query.set('from', defaultRange.from);
    query.set('to', defaultRange.to);
  }

  return query;
}

export default async function list(
  client: Client,
  telemetry: AlertsTelemetryClient
): Promise<number> {
  const flags = parseFlags(client);
  if (typeof flags === 'number') {
    return flags;
  }
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const types = normalizeRepeatableStringFilters(flags['--type']);
  trackTelemetry(flags, types, telemetry);

  const validatedInputs = resolveValidatedInputs(flags, client, jsonOutput);
  if (typeof validatedInputs === 'number') {
    return validatedInputs;
  }

  const scope = await resolveScope(client, {
    project: flags['--project'],
    all: flags['--all'],
    jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const query = buildAlertsQuery(scope, validatedInputs);

  const requestPath = `/alerts/v3/groups?${query.toString()}`;
  output.debug(`Fetching alerts from ${requestPath}`);

  output.spinner('Fetching alerts...');
  try {
    const groups = await client.fetch<AlertGroup[]>(requestPath);

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify({ groups }, null, 2)}\n`);
    } else {
      if (flags['--ai']) {
        printAiSections(groups);
      } else {
        printGroups(groups);
      }
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client);
    }

    output.debug(err);
    const message = `Failed to fetch alerts: ${(err as Error).message || String(err)}`;
    return outputError(client, jsonOutput, 'UNEXPECTED_ERROR', message);
  } finally {
    output.stopSpinner();
  }
}
