import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import {
  handleValidationError,
  normalizeRepeatableStringFilters,
  outputError,
  validateAllProjectMutualExclusivity,
  validateOptionalIntegerRange,
  validateTimeBound,
  validateTimeOrder,
  type ValidationError,
} from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import formatDate from '../../util/format-date';
import { truncateEnd } from '../../util/output/truncate';
import { printNextPageHint } from '../../util/pagination';
import type { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';
import { acknowledgedSubcommand, mutedSubcommand } from './command';
import { resolveAlertsScope } from './resolve-alerts-scope';
import { getGroupTitle, normalizeTimestamp, renderAlertTable } from './format';
import {
  getAcknowledgedAt,
  getMuteCoverage,
  getMuteExpiry,
} from './group-state';
import type { AlertGroup } from './types';

/**
 * A list served by `GET /alerts/v4/groups?views=<view>`, which pages over every
 * acknowledged or muted group instead of only the most recent ones.
 */
export type AlertsView = 'acknowledged' | 'muted';

const SUBCOMMANDS = {
  acknowledged: acknowledgedSubcommand,
  muted: mutedSubcommand,
} as const;

const DEFAULT_LIMIT = 20;

interface ViewFlags {
  '--type'?: string[];
  '--project'?: string;
  '--all'?: boolean;
  '--since'?: string;
  '--until'?: string;
  '--limit'?: number;
  '--next'?: string;
  '--format'?: string;
}

interface V4Group extends AlertGroup {
  latestEventAt?: number;
  severity?: string;
  detections?: unknown[];
}

interface V4ListResponse {
  alerts: V4Group[];
  pagination: { count: number; next: string | null };
  counts?: Record<string, number>;
  truncated?: boolean;
}

function usageError(
  client: Client,
  view: AlertsView,
  result: ValidationError,
  jsonOutput: boolean
): number {
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: result.message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `alerts ${view} --help`
            ),
            when: `See valid \`alerts ${view}\` options`,
          },
        ],
      },
      2
    );
  }
  return handleValidationError(result, jsonOutput, client);
}

function handleApiError(
  client: Client,
  view: AlertsView,
  jsonOutput: boolean,
  err: { status: number; code?: string; serverMessage?: string }
): number {
  const message =
    err.status === 401 || err.status === 403
      ? 'You do not have access to alerts in this scope. Pass --token <TOKEN> and --scope <team-slug> with Alerts read access.'
      : err.status === 400 &&
          err.serverMessage?.toLowerCase().includes('cursor')
        ? `The --next cursor is invalid or expired. Run \`alerts ${view}\` again without --next and with the same filters.`
        : err.status >= 500
          ? `The alerts endpoint failed on the server (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
          : err.serverMessage || `API error (${err.status}).`;
  const reason =
    err.status === 401
      ? 'not_authorized'
      : err.status === 403
        ? 'forbidden'
        : err.status === 404
          ? AGENT_REASON.NOT_FOUND
          : err.status === 429
            ? 'rate_limited'
            : AGENT_REASON.API_ERROR;
  outputAgentError(client, { status: 'error', reason, message }, 1);
  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

function getStatus(group: V4Group): string {
  return group.status || '-';
}

function printGroups(
  groups: V4Group[],
  view: AlertsView,
  hasFilters: boolean
): void {
  if (groups.length === 0) {
    output.log(
      hasFilters
        ? `No ${view} alerts match these filters.`
        : `No ${view} alerts.`
    );
    return;
  }

  const viewHeaders =
    view === 'acknowledged' ? ['Acknowledged At'] : ['Muted Until', 'Coverage'];
  const headers = [
    'Title',
    'Group id',
    'Latest Event',
    'Type',
    'Status',
    ...viewHeaders,
  ].map(h => chalk.cyan(h));

  const rows = groups.map(group => {
    const row = [
      chalk.bold(truncateEnd(getGroupTitle(group), 80)),
      chalk.dim(group.id || '-'),
      formatDate(
        normalizeTimestamp(group.latestEventAt ?? group.recordedStartedAt)
      ),
      group.type || '-',
      getStatus(group),
    ];
    if (view === 'acknowledged') {
      row.push(formatDate(getAcknowledgedAt(group)));
    } else {
      const expiry = getMuteExpiry(group);
      row.push(
        expiry === null
          ? 'until unmuted'
          : expiry === undefined
            ? '-'
            : formatDate(expiry),
        getMuteCoverage(group) ?? '-'
      );
    }
    return row;
  });

  output.print(`\n${renderAlertTable([headers, ...rows], 3)}\n`);
}

export default async function listView(
  client: Client,
  argv: string[],
  view: AlertsView,
  tracking: { telemetry: AlertsTelemetryClient; subcommandOriginal: string }
): Promise<number> {
  const { telemetry, subcommandOriginal } = tracking;
  if (view === 'acknowledged') {
    telemetry.trackCliSubcommandAcknowledged(subcommandOriginal);
  } else {
    telemetry.trackCliSubcommandMuted(subcommandOriginal);
  }

  let flags: ViewFlags;
  try {
    flags = parseArguments(
      argv,
      getFlagsSpecification(SUBCOMMANDS[view].options)
    ).flags as ViewFlags;
  } catch (err) {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: err instanceof Error ? err.message : String(err),
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `alerts ${view} --help`
              ),
              when: `See valid \`alerts ${view}\` options`,
            },
          ],
        },
        2
      );
    }
    printError(err);
    return 2;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const jsonOutput = formatResult.jsonOutput;

  const types = normalizeRepeatableStringFilters(flags['--type']);
  telemetry.trackCliOptionType(types.length > 0 ? types : undefined);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagAll(flags['--all']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionFormat(flags['--format']);

  const limitResult = validateOptionalIntegerRange(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
  });
  if (!limitResult.valid) {
    return usageError(client, view, limitResult, jsonOutput);
  }
  const mutualResult = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutualResult.valid) {
    return usageError(client, view, mutualResult, jsonOutput);
  }
  const sinceResult = validateTimeBound(flags['--since']);
  if (!sinceResult.valid) {
    return usageError(client, view, sinceResult, jsonOutput);
  }
  const untilResult = validateTimeBound(flags['--until']);
  if (!untilResult.valid) {
    return usageError(client, view, untilResult, jsonOutput);
  }
  const orderResult = validateTimeOrder(sinceResult.value, untilResult.value);
  if (!orderResult.valid) {
    return usageError(client, view, orderResult, jsonOutput);
  }
  const cursor = flags['--next'];
  if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,4096}$/.test(cursor)) {
    return usageError(
      client,
      view,
      {
        valid: false,
        code: 'INVALID_NEXT',
        message:
          '`--next` must be the cursor printed by the previous page of results.',
      },
      jsonOutput
    );
  }

  const scope = await resolveAlertsScope(client, {
    project: flags['--project'],
    all: flags['--all'],
    jsonOutput,
    command: `alerts ${view}`,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const query = new URLSearchParams({
    teamId: scope.teamId,
    views: view,
    sort: 'date',
    limit: String(limitResult.value ?? DEFAULT_LIMIT),
  });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
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
  if (cursor) {
    query.set('cursor', cursor);
  }

  const requestPath = `/alerts/v4/groups?${query.toString()}`;
  output.debug(`Fetching ${view} alerts from ${requestPath}`);
  if (!jsonOutput) {
    output.spinner(`Fetching ${view} alerts...`);
  }
  try {
    const result = await client.fetch<V4ListResponse>(requestPath);
    output.stopSpinner();
    const groups = result.alerts ?? [];
    const next = result.pagination?.next ?? null;
    const truncated = Boolean(result.truncated);

    if (jsonOutput) {
      client.stdout.write(
        `${JSON.stringify(
          {
            groups,
            pagination: { next },
            ...(truncated
              ? {
                  warnings: [
                    {
                      reason: 'truncated',
                      message:
                        'The API searched only the 1,000 most recent groups per type, so this list may be incomplete. Narrow it with --project, --type, --since, or --until.',
                    },
                  ],
                }
              : {}),
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    const hasFilters = Boolean(
      types.length > 0 || sinceResult.value || untilResult.value
    );
    printGroups(groups, view, hasFilters);
    if (truncated) {
      output.warning(
        'The API searched only the 1,000 most recent groups per type, so this list may be incomplete. Narrow it with --project, --type, --since, or --until.'
      );
    }
    printNextPageHint(client, next);
    return 0;
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err)) {
      return handleApiError(client, view, jsonOutput, err);
    }
    output.debug(err);
    return outputError(
      client,
      jsonOutput,
      'UNEXPECTED_ERROR',
      `Failed to fetch ${view} alerts: ${(err as Error).message || String(err)}`
    );
  }
}
