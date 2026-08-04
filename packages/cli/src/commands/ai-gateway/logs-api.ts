import type Client from '../../util/client';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getTeamById from '../../util/teams/get-team-by-id';

const REQUESTS_API_URL = 'https://vercel.com/api/ai/gateway-inference-requests';
const METRICS_API_URL = 'https://vercel.com/api/observability/metrics';
const COST_SEMANTICS_CUTOVER_MS = Date.UTC(2026, 4, 16, 1, 0, 0);
const GENERATION_ID_PATTERN = /^gen_[0-9A-HJKMNP-TV-Z]{26}$/i;
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

type UnknownRecord = Record<string, unknown>;

export interface AiGatewayLog {
  generationId: string;
  timestamp: string;
  status: number | null;
  model: string | null;
  provider: string | null;
  region: string | null;
  projectId: string | null;
  environment: string | null;
  durationMs: number | null;
  timeToFirstTokenMs: number | null;
  cost: {
    total: number | null;
    inference: number | null;
    currency: string;
  };
  tokens: {
    input: number;
    cachedInput: number;
    cacheCreationInput: number;
    output: number;
    reasoning: number;
    total: number;
  };
}

export interface AiGatewayProviderAttempt {
  modelIndex: number;
  attempt: number;
  provider: string | null;
  model: string | null;
  credentialType: 'byok' | 'vercel';
  success: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number | null;
}

export interface LogsContext {
  teamId: string;
  teamSlug: string;
}

export interface LogsListQuery {
  context: LogsContext;
  projectId?: string;
  startTime: Date;
  endTime: Date;
  provider?: string;
  model?: string;
  status?: string;
  search?: string;
  environment?: string;
  page: number;
  limit: number;
}

export async function resolveLogsContext(
  client: Client
): Promise<LogsContext | null> {
  if (!(await ensureTeam(client))) return null;
  const teamId = client.config.currentTeam;
  if (!teamId) return null;
  const team = await getTeamById(client, teamId);
  return { teamId: team.id, teamSlug: team.slug };
}

function getRequestsApiUrl(): string {
  return process.env.VERCEL_AI_GATEWAY_LOGS_API_URL || REQUESTS_API_URL;
}

function getMetricsApiUrl(): string {
  return process.env.VERCEL_AI_GATEWAY_METRICS_API_URL || METRICS_API_URL;
}

export function isValidGenerationId(value: string): boolean {
  return GENERATION_ID_PATTERN.test(value);
}

export function buildLogsListUrl(query: LogsListQuery): string {
  const url = new URL(getRequestsApiUrl());
  url.searchParams.set('teamId', query.context.teamId);
  url.searchParams.set('startTime', query.startTime.toISOString());
  url.searchParams.set('endTime', query.endTime.toISOString());
  url.searchParams.set('limit', String(query.limit));
  url.searchParams.set('offset', String((query.page - 1) * query.limit));
  url.searchParams.set('sortBy', 'timestamp');
  url.searchParams.set('sortDir', 'DESC');
  if (query.projectId) url.searchParams.set('projectId', query.projectId);
  if (query.search) url.searchParams.set('q', query.search);
  if (query.environment) url.searchParams.set('environment', query.environment);
  if (query.provider) url.searchParams.set('aiProvider', query.provider);
  if (query.model) url.searchParams.set('aiModel', query.model);
  if (query.status) url.searchParams.set('status', query.status);
  return url.href;
}

export async function fetchLogsList(
  client: Client,
  query: LogsListQuery
): Promise<{ logs: AiGatewayLog[]; returned: number }> {
  const response = await client.fetch<unknown>(buildLogsListUrl(query), {
    useCurrentTeam: false,
  });
  const record = asRecord(response);
  const rows = Array.isArray(record?.data) ? record.data : [];
  const logs = rows
    .map(normalizeLog)
    .filter((log): log is AiGatewayLog => !!log);
  const pageInfo = asRecord(record?.pageInfo);
  return {
    logs,
    returned: readNumber(pageInfo, 'returned') ?? logs.length,
  };
}

export async function fetchLog(
  client: Client,
  context: LogsContext,
  generationId: string
): Promise<AiGatewayLog | null> {
  const { startTime, endTime } = getGenerationWindow(generationId);
  const url = new URL(getRequestsApiUrl());
  url.searchParams.set('teamId', context.teamId);
  url.searchParams.set('generationId', generationId);
  url.searchParams.set('startTime', startTime.toISOString());
  url.searchParams.set('endTime', endTime.toISOString());
  url.searchParams.set('limit', '1');
  const response = await client.fetch<unknown>(url.href, {
    useCurrentTeam: false,
  });
  const rows = asRecord(response)?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return normalizeLog(rows[0]);
}

export async function fetchProviderAttempts(
  client: Client,
  context: LogsContext,
  generationId: string
): Promise<AiGatewayProviderAttempt[]> {
  const { startTime, endTime } = getGenerationWindow(generationId);
  const url = new URL(getMetricsApiUrl());
  url.searchParams.set('slug', context.teamSlug);
  const escapedGenerationId = generationId.replace(/'/g, "''");
  const response = await client.fetch<unknown>(url.href, {
    method: 'POST',
    body: {
      event: 'aiGatewayProviderAttempt',
      scope: { type: 'team-with-slug', teamSlug: context.teamSlug },
      summaryOnly: true,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      granularity: '1h',
      reason: 'ai_gateway_chart',
      groupBy: [
        'aiProvider',
        'providerAttemptCanonicalSlug',
        'providerAttemptCredentialType',
        'providerAttemptSuccess',
        'providerAttemptStatusCode',
        'providerAttemptError',
        'providerAttemptModelIndex',
        'providerAttemptNumber',
      ],
      rollups: {
        responseTimeMs: {
          measure: 'providerAttemptResponseTimeMs',
          aggregation: 'sum',
        },
      },
      filter: `generationId eq '${escapedGenerationId}'`,
      limit: 50,
    },
    useCurrentTeam: false,
  });
  const record = asRecord(response);
  const nested = asRecord(record?.data);
  const rows = Array.isArray(record?.summary)
    ? record.summary
    : Array.isArray(nested?.summary)
      ? nested.summary
      : [];
  return rows
    .map(normalizeProviderAttempt)
    .filter((attempt): attempt is AiGatewayProviderAttempt => !!attempt)
    .sort((a, b) => {
      if (a.success !== b.success) return Number(a.success) - Number(b.success);
      if (a.modelIndex !== b.modelIndex) return a.modelIndex - b.modelIndex;
      return a.attempt - b.attempt;
    });
}

function getGenerationWindow(generationId: string): {
  startTime: Date;
  endTime: Date;
} {
  const timestamp = decodeGenerationTimestamp(generationId) ?? Date.now();
  return {
    startTime: new Date(timestamp - 60 * 60 * 1000),
    endTime: new Date(timestamp + 60 * 60 * 1000),
  };
}

function decodeGenerationTimestamp(generationId: string): number | null {
  const ulid = generationId.slice(4).toUpperCase();
  if (ulid.length < 10) return null;
  let timestamp = 0;
  for (const char of ulid.slice(0, 10)) {
    const value = ULID_ALPHABET.indexOf(char);
    if (value === -1) return null;
    timestamp = timestamp * 32 + value;
  }
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

function normalizeLog(value: unknown): AiGatewayLog | null {
  const row = asRecord(value);
  if (!row) return null;
  const generationId = readString(row, 'generationId');
  const timestamp = readString(row, 'timestamp');
  if (!generationId || !timestamp) return null;
  const input = readNumber(row, 'inputTokens') ?? 0;
  const cachedInput = readNumber(row, 'cachedInputTokens') ?? 0;
  const cacheCreationInput = readNumber(row, 'cacheCreationInputTokens') ?? 0;
  const output = readNumber(row, 'outputTokens') ?? 0;
  const reasoning = readNumber(row, 'reasoningTokens') ?? 0;
  const costs = resolveCosts(row, timestamp);
  return {
    generationId,
    timestamp: normalizeTimestamp(timestamp),
    status: readNumber(row, 'httpStatus'),
    model: readString(row, 'aiModel'),
    provider: readString(row, 'aiProvider'),
    region: readString(row, 'inferenceGeoRegion'),
    projectId: readString(row, 'projectId'),
    environment: readString(row, 'environment'),
    durationMs: readNumber(row, 'aiRequestDurationMs'),
    timeToFirstTokenMs: readNumber(row, 'timeToFirstTokenMs'),
    cost: {
      total: costs.total,
      inference: costs.inference,
      currency: readString(row, 'costCurrency') || 'USD',
    },
    tokens: {
      input,
      cachedInput,
      cacheCreationInput,
      output,
      reasoning,
      total: input + output + reasoning,
    },
  };
}

function normalizeProviderAttempt(
  value: unknown
): AiGatewayProviderAttempt | null {
  const row = asRecord(value);
  if (!row) return null;
  return {
    modelIndex: readNumber(row, 'providerAttemptModelIndex') ?? 0,
    attempt: readNumber(row, 'providerAttemptNumber') ?? 0,
    provider: readString(row, 'aiProvider'),
    model: readString(row, 'providerAttemptCanonicalSlug'),
    credentialType:
      readString(row, 'providerAttemptCredentialType') === 'byok'
        ? 'byok'
        : 'vercel',
    success: String(row.providerAttemptSuccess) === '1',
    statusCode: readNumber(row, 'providerAttemptStatusCode'),
    error: readString(row, 'providerAttemptError'),
    durationMs: readNumber(row, 'responseTimeMs'),
  };
}

function resolveCosts(
  row: UnknownRecord,
  timestamp: string
): { total: number | null; inference: number | null } {
  const cost = readNumber(row, 'cost');
  if (cost === null) return { total: null, inference: null };
  const surcharges = [
    'zdrCost',
    'reportingWriteCost',
    'providerAllowlistCost',
    'modelAllowlistCost',
    'quotaWriteCost',
  ].reduce((sum, key) => sum + (readNumber(row, key) ?? 0), 0);
  const rowMs = Date.parse(normalizeTimestamp(timestamp));
  return rowMs >= COST_SEMANTICS_CUTOVER_MS
    ? { total: cost + surcharges, inference: cost }
    : { total: cost, inference: cost - surcharges };
}

function normalizeTimestamp(value: string): string {
  const normalized = value.endsWith('Z') ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(record: UnknownRecord | null, key: string): number | null {
  const value = record?.[key];
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
