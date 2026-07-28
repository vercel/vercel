import chalk from 'chalk';
import format from 'date-fns/format';
import ms from 'ms';
import { setTimeout as delay } from 'node:timers/promises';
import type Client from './client';
import { CommandTimeout } from '../commands/logs/command';
import { formatProject } from './projects/format-project';
import output from '../output-manager';
import {
  fetchRequestLogs,
  type RequestLogEntry,
} from './logs-v2';

export const FOLLOW_POLL_INTERVAL_MS = 2000;
export const FOLLOW_LOOKBACK_MS = 10_000;
export const FOLLOW_OVERLAP_MS = 5_000;

const DATE_TIME_FORMAT = 'HH:mm:ss.SS';
const moreSymbol = '\u2026';
const statusWidth = 3;
const followSpinnerMessage = 'waiting for new logs...';

export type FollowEventType =
  | 'request_started'
  | 'log'
  | 'request_finished';

export interface FollowEventBase {
  type: FollowEventType;
  timestamp: number;
  requestId: string;
  deploymentId: string;
  projectId: string;
  environment: 'production' | 'preview';
  branch?: string;
  domain: string;
  requestMethod: string;
  requestPath: string;
  source: RequestLogEntry['source'];
  level: RequestLogEntry['level'];
  responseStatusCode: number | null;
}

export interface FollowRequestStartedEvent extends FollowEventBase {
  type: 'request_started';
}

export interface FollowLogEvent extends FollowEventBase {
  type: 'log';
  message: string;
  messageTruncated?: boolean;
}

export interface FollowRequestFinishedEvent extends FollowEventBase {
  type: 'request_finished';
  responseStatusCode: number | null;
  durationMs?: number;
}

export type FollowEvent =
  | FollowRequestStartedEvent
  | FollowLogEvent
  | FollowRequestFinishedEvent;

interface RequestFollowState {
  logsEmitted: number;
  finished: boolean;
  prefix: string;
}

export interface FollowRequestLogsOptions {
  projectId: string;
  projectSlug: string;
  orgSlug: string;
  ownerId: string;
  deploymentId?: string;
  environment?: string;
  branch?: string;
  json?: boolean;
  abortController: AbortController;
  pollIntervalMs?: number;
  lookbackMs?: number;
  overlapMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  fetchLogs?: typeof fetchRequestLogs;
  /** Test helper: stop after N successful polls. */
  maxPolls?: number;
}

function isSettled(row: RequestLogEntry): boolean {
  // Incomplete live rows use requestDurationMs = -1 upstream, which maps to undefined.
  return typeof row.requestDurationMs === 'number';
}

function statusOrNull(statusCode: number): number | null {
  return statusCode > 0 ? statusCode : null;
}

function levelFromStatus(
  statusCode: number | null,
  fallback: RequestLogEntry['level']
): RequestLogEntry['level'] {
  if (statusCode !== null && statusCode >= 500) return 'error';
  if (statusCode !== null && statusCode >= 400) return 'warning';
  return fallback;
}

function baseFromRow(
  row: RequestLogEntry,
  overrides: Partial<FollowEventBase> = {}
): Omit<FollowEventBase, 'type'> {
  const responseStatusCode =
    overrides.responseStatusCode !== undefined
      ? overrides.responseStatusCode
      : statusOrNull(row.responseStatusCode);
  return {
    timestamp: overrides.timestamp ?? row.timestamp,
    requestId: row.id,
    deploymentId: row.deploymentId,
    projectId: row.projectId,
    environment: row.environment,
    branch: row.branch,
    domain: row.domain,
    requestMethod: row.requestMethod,
    requestPath: row.requestPath,
    source: row.source,
    level:
      overrides.level ??
      levelFromStatus(responseStatusCode, row.level || 'info'),
    responseStatusCode,
  };
}

function shortPrefix(requestId: string, length = 4): string {
  if (!requestId) return '????';
  const cleaned = requestId.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length <= length) return cleaned.padStart(length, '0');
  return cleaned.slice(-length);
}

export function assignRequestPrefix(
  requestId: string,
  activePrefixes: Map<string, string>
): string {
  let length = 4;
  while (length <= Math.max(4, requestId.length)) {
    const candidate = shortPrefix(requestId, length);
    const owner = [...activePrefixes.entries()].find(
      ([id, prefix]) => id !== requestId && prefix === candidate
    );
    if (!owner) {
      activePrefixes.set(requestId, candidate);
      return candidate;
    }
    length += 1;
  }
  const fallback = requestId.slice(-8) || 'unknown';
  activePrefixes.set(requestId, fallback);
  return fallback;
}

/**
 * Diff incoming request-log rows against prior follow state and emit events.
 * Pure/testable core of the follow poller.
 */
export function processFollowRows(
  rows: RequestLogEntry[],
  state: Map<string, RequestFollowState>,
  activePrefixes: Map<string, string>
): FollowEvent[] {
  const events: FollowEvent[] = [];
  const sorted = [...rows].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });

  for (const row of sorted) {
    if (!row.id) continue;

    let entry = state.get(row.id);
    if (!entry) {
      const prefix = assignRequestPrefix(row.id, activePrefixes);
      entry = { logsEmitted: 0, finished: false, prefix };
      state.set(row.id, entry);
      events.push({
        type: 'request_started',
        ...baseFromRow(row),
      });
    }

    const newLogs = row.logs.slice(entry.logsEmitted);
    for (const log of newLogs) {
      events.push({
        type: 'log',
        ...baseFromRow(row, {
          level: (log.level as RequestLogEntry['level']) || row.level || 'info',
          // Log lines keep --- until the finished event carries the final status.
          responseStatusCode: entry.finished
            ? statusOrNull(row.responseStatusCode)
            : null,
        }),
        message: log.message,
        messageTruncated: log.messageTruncated,
      });
    }
    entry.logsEmitted = row.logs.length;

    if (!entry.finished && isSettled(row)) {
      entry.finished = true;
      const responseStatusCode = statusOrNull(row.responseStatusCode);
      events.push({
        type: 'request_finished',
        ...baseFromRow(row, {
          responseStatusCode,
          level: levelFromStatus(responseStatusCode, row.level || 'info'),
        }),
        durationMs: row.requestDurationMs,
      });
      activePrefixes.delete(row.id);
    }
  }

  return events;
}

function getLevelIcon(level: string) {
  return level === 'error' || level === 'fatal'
    ? '🚫'
    : level === 'warning'
      ? '⚠️'
      : 'ℹ️';
}

function getSourceIcon(source: string) {
  if (source === 'edge-function') return 'ന';
  if (source === 'edge-middleware') return 'ɛ';
  if (source === 'serverless') return 'ƒ';
  if (source === 'static') return '◇';
  return ' ';
}

function formatStatus(status: number | null): string {
  return status === null || status <= 0 ? '---' : String(status);
}

function formatSummaryLine(
  event: FollowEventBase,
  suffix?: string
): {
  detailsLine: string;
  separator: string;
} {
  const date = format(event.timestamp, DATE_TIME_FORMAT);
  const levelIcon = getLevelIcon(event.level);
  const sourceIcon = getSourceIcon(event.source);
  const status = formatStatus(event.responseStatusCode);
  const suffixPart = suffix ? `  ${suffix}` : '';
  const detailsLine = `${chalk.dim(date)}  ${levelIcon}  ${chalk.bold(
    event.requestMethod || '—'
  )}  ${chalk.grey(status)}  ${chalk.dim(
    event.domain || ''
  )}  ${sourceIcon}  ${event.requestPath || ''}${suffixPart}`;
  const separator = '-'.repeat(
    [
      date.length,
      levelIcon.length,
      (event.requestMethod || '—').length,
      statusWidth,
      (event.domain || '').length,
      sourceIcon.length,
      (event.requestPath || '').length,
    ].reduce((sum, length) => sum + 2 + length)
  );
  return { detailsLine, separator };
}

export function getFollowPrefix(
  requestId: string,
  state: Map<string, RequestFollowState>,
  activePrefixes: Map<string, string>
): string {
  return (
    state.get(requestId)?.prefix ??
    activePrefixes.get(requestId) ??
    shortPrefix(requestId)
  );
}

export function formatFollowHuman(
  event: FollowEvent,
  prefix: string
): string {
  const tag = `[${prefix}]`;
  if (event.type === 'request_started') {
    const { detailsLine } = formatSummaryLine(event, 'Request started');
    return `${tag} ${detailsLine}\n`;
  }

  if (event.type === 'request_finished') {
    const duration =
      typeof event.durationMs === 'number' ? ` (${event.durationMs}ms)` : '';
    const { detailsLine } = formatSummaryLine(
      event,
      `Request finished${duration}`
    );
    return `${tag} ${detailsLine}\n`;
  }

  const { detailsLine, separator } = formatSummaryLine(event);
  const message = `${event.message.replace(/\n$/, '')}${
    event.messageTruncated ? moreSymbol : ''
  }`;
  return `${tag} ${detailsLine}\n${tag} ${separator}\n${tag} ${message}\n\n`;
}

export function formatFollowJson(event: FollowEvent): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: event.type,
    timestamp: event.timestamp,
    requestId: event.requestId,
    deploymentId: event.deploymentId,
    projectId: event.projectId,
    environment: event.environment,
    branch: event.branch,
    domain: event.domain,
    requestMethod: event.requestMethod,
    requestPath: event.requestPath,
    source: event.source,
    level: event.level,
    responseStatusCode: event.responseStatusCode,
  };

  if (event.type === 'log') {
    base.message = event.message;
    base.messageTruncated = event.messageTruncated ?? false;
  }

  if (event.type === 'request_finished') {
    if (typeof event.durationMs === 'number') {
      base.durationMs = event.durationMs;
    }
  }

  return base;
}

function buildScopeLabel(options: {
  environment?: string;
  branch?: string;
  deploymentId?: string;
}): string {
  const parts: string[] = [];
  if (options.deploymentId) {
    parts.push(`deployment ${options.deploymentId}`);
  }
  if (options.environment) {
    parts.push(options.environment);
  }
  if (options.branch) {
    parts.push(`branch ${options.branch}`);
  } else if (!options.deploymentId) {
    parts.push('all branches');
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

async function defaultSleep(msValue: number, signal?: AbortSignal) {
  await delay(msValue, undefined, { signal }).catch((err: unknown) => {
    if (signal?.aborted) return;
    throw err;
  });
}

export async function followRequestLogs(
  client: Client,
  options: FollowRequestLogsOptions
): Promise<number> {
  const {
    projectId,
    projectSlug,
    orgSlug,
    ownerId,
    deploymentId,
    environment,
    branch,
    json = false,
    abortController,
    pollIntervalMs = FOLLOW_POLL_INTERVAL_MS,
    lookbackMs = FOLLOW_LOOKBACK_MS,
    overlapMs = FOLLOW_OVERLAP_MS,
    now = Date.now,
    sleep = defaultSleep,
    fetchLogs = fetchRequestLogs,
    maxPolls,
  } = options;

  const { print, spinner, stopSpinner, warn, debug } = output;
  const state = new Map<string, RequestFollowState>();
  const activePrefixes = new Map<string, string>();

  let cursor = now() - lookbackMs;
  const startedAt = now();
  let polls = 0;

  if (!json) {
    print(
      `Streaming request logs for ${formatProject(orgSlug, projectSlug)}${buildScopeLabel(
        { environment, branch, deploymentId }
      )} starting from ${chalk.bold(format(startedAt, DATE_TIME_FORMAT))}\n\n`
    );
  }

  const timeout = setTimeout(() => {
    abortController.abort();
    warn(
      `${chalk.bold(
        `Command automatically interrupted after ${CommandTimeout}.`
      )}\n`
    );
  }, ms(CommandTimeout));

  const emit = (event: FollowEvent) => {
    const prefix = getFollowPrefix(event.requestId, state, activePrefixes);
    if (json) {
      client.stdout.write(`${JSON.stringify(formatFollowJson(event))}\n`);
    } else {
      print(formatFollowHuman(event, prefix));
    }
  };

  try {
    while (!abortController.signal.aborted) {
      if (!json) {
        spinner(followSpinnerMessage);
      }

      const tickNow = now();
      let rows: RequestLogEntry[] = [];
      try {
        const response = await fetchLogs(client, {
          projectId,
          ownerId,
          deploymentId,
          environment,
          branch,
          startDate: cursor,
          live: true,
          // Follow polls the latest window only; one page is enough.
          page: 0,
        });
        rows = response.logs;
      } catch (err) {
        if (abortController.signal.aborted) break;
        stopSpinner();
        const message = err instanceof Error ? err.message : String(err);
        debug(`Request logs follow poll error: ${message}`);
        await sleep(pollIntervalMs, abortController.signal);
        continue;
      }

      stopSpinner();

      const events = processFollowRows(rows, state, activePrefixes);
      for (const event of events) {
        emit(event);
      }

      if (rows.length > 0) {
        const latest = Math.max(...rows.map(row => row.timestamp));
        cursor = Math.max(cursor, latest - overlapMs);
      } else {
        // Keep a small lookback so late-arriving incomplete rows can settle.
        cursor = Math.max(cursor, tickNow - overlapMs);
      }

      polls += 1;
      if (typeof maxPolls === 'number' && polls >= maxPolls) {
        break;
      }

      await sleep(pollIntervalMs, abortController.signal);
    }
  } finally {
    clearTimeout(timeout);
    stopSpinner();
  }

  return abortController.signal.aborted ? 1 : 0;
}
