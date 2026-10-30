import { createHash } from 'node:crypto';
import { isRecord, type UnknownRecord } from './format';

/** Epoch seconds, as sent in the list endpoint's `from` and `to` params. */
export type AgentRunsListWindow = { from: number; to: number };

/**
 * State for `vercel agent-runs list --next <CURSOR>`. The list endpoint merges
 * Workflow and OTEL runs and continues only from the `cursor` query param
 * built from `pageInfo.nextOffsets`; `page` is only a label there. The source
 * offsets are bound to the query that produced them, so the token also pins
 * the time range and a fingerprint of the scope and filters.
 */
export type AgentRunsListContinuation = {
  version: 1;
  /** The list endpoint's `cursor` query param. */
  cursor: string;
  /** 1-based label of the page this token fetches. */
  page: number;
  window: AgentRunsListWindow;
  filters: string;
};

const MAX_TOKEN_LENGTH = 8192;
const MAX_SOURCE_OFFSET = 10_000;
const OTEL_CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,4096}$/;
const SOURCE_CURSOR_PATTERN =
  /^[0-9a-z]+\.[0-9a-z]+(\.[0-9a-z]+\.[0-9a-z]+(\.[A-Za-z0-9_-]{1,4096})?)?$/;
const FILTERS_LENGTH = 22;

function isSourceOffset(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_SOURCE_OFFSET
  );
}

function isEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isWindow(value: unknown): value is AgentRunsListWindow {
  if (!isRecord(value)) return false;
  const { from, to } = value;
  return isEpoch(from) && isEpoch(to) && from < to;
}

/**
 * Encodes `pageInfo.nextOffsets` as the endpoint's
 * `<otel>.<workflow>[.<otelRange.from>.<otelRange.to>[.<otelCursor>]]` cursor,
 * with numbers in base36. Returns `undefined` for offsets the endpoint would
 * not continue from exactly.
 */
export function encodeAgentRunsSourceCursor(
  offsets: UnknownRecord | undefined
): string | undefined {
  if (!offsets) return undefined;
  const { otel, workflow, otelCursor } = offsets;
  if (!isSourceOffset(otel) || !isSourceOffset(workflow)) return undefined;

  const parts = [otel.toString(36), workflow.toString(36)];
  const range = offsets.otelRange;
  if (range !== undefined) {
    if (!isWindow(range)) return undefined;
    parts.push(range.from.toString(36), range.to.toString(36));
  }
  if (otelCursor !== undefined) {
    // The endpoint reads the OTEL cursor only together with its range.
    if (
      range === undefined ||
      typeof otelCursor !== 'string' ||
      !OTEL_CURSOR_PATTERN.test(otelCursor)
    ) {
      return undefined;
    }
    parts.push(otelCursor);
  }
  return parts.join('.');
}

export function getAgentRunsListFilters({
  teamId,
  projectId,
  environment,
  search,
}: {
  teamId: string;
  projectId: string | undefined;
  environment: string | undefined;
  search: string | undefined;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        teamId,
        projectId ?? null,
        environment || 'production',
        search || null,
      ])
    )
    .digest('base64url')
    .slice(0, FILTERS_LENGTH);
}

export function encodeAgentRunsListContinuation(
  continuation: AgentRunsListContinuation
): string {
  return Buffer.from(JSON.stringify(continuation), 'utf8').toString(
    'base64url'
  );
}

export function parseAgentRunsListContinuation(
  value: string
): AgentRunsListContinuation | undefined {
  if (
    value.length === 0 ||
    value.length > MAX_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return undefined;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (
    !isRecord(decoded) ||
    decoded.version !== 1 ||
    typeof decoded.cursor !== 'string' ||
    !SOURCE_CURSOR_PATTERN.test(decoded.cursor) ||
    typeof decoded.page !== 'number' ||
    !Number.isSafeInteger(decoded.page) ||
    decoded.page < 2 ||
    typeof decoded.filters !== 'string' ||
    decoded.filters.length !== FILTERS_LENGTH ||
    !isWindow(decoded.window)
  ) {
    return undefined;
  }
  return {
    version: 1,
    cursor: decoded.cursor,
    page: decoded.page,
    window: { from: decoded.window.from, to: decoded.window.to },
    filters: decoded.filters,
  };
}
