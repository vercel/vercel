import type Client from '../client';
import type { CiGitProvider } from './git-context';
import { readNdjson } from './ndjson';
import type {
  CiInvocation,
  CiInvocationTree,
  CiListInvocationsResponse,
  CiLogLine,
  CiTaskConclusion,
} from './types';

export type CiTeamResolution =
  | { ok: true; accountId?: string }
  | { ok: false; exitCode: number };

/**
 * Vercel CI runs belong to a team, not a project, so requests always use the
 * current team (or the one passed with `--team`).
 */
export async function resolveCiTeam(
  _client: Client
): Promise<CiTeamResolution> {
  return { ok: true };
}

export type ListCiInvocationsParams = {
  provider: CiGitProvider;
  repository: string;
  branch?: string;
  commitSha?: string;
  statuses?: readonly string[];
  conclusions?: readonly string[];
  limit?: number;
  cursor?: string;
};

export function listCiInvocations(
  client: Client,
  params: ListCiInvocationsParams,
  accountId?: string
): Promise<CiListInvocationsResponse> {
  const query = new URLSearchParams({
    provider: params.provider,
    repository: params.repository,
  });
  if (params.branch) query.set('branchName', params.branch);
  if (params.commitSha) query.set('snapshot', params.commitSha);
  for (const status of params.statuses ?? []) query.append('status', status);
  for (const conclusion of params.conclusions ?? []) {
    query.append('conclusion', conclusion);
  }
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);

  return client.fetch<CiListInvocationsResponse>(
    `/v2/vercel-ci/invocations?${query}`,
    { accountId }
  );
}

export function getCiInvocationTree(
  client: Client,
  invocationId: string,
  options: { attempt?: number; accountId?: string } = {}
): Promise<CiInvocationTree> {
  const query = new URLSearchParams();
  if (options.attempt) query.set('attempt', String(options.attempt));
  const suffix = query.size ? `?${query}` : '';
  return client.fetch<CiInvocationTree>(
    `/v1/vercel-ci/invocations/${encodeURIComponent(invocationId)}/tree${suffix}`,
    { accountId: options.accountId }
  );
}

export type CiInvocationTreeEvent =
  | ({ type: 'tree' } & CiInvocationTree)
  | { type: 'end'; reason: 'completed' | 'timeout' };

export function streamCiInvocationTree(
  client: Client,
  invocationId: string,
  options: { attempt: number; accountId?: string; signal?: AbortSignal }
): AsyncGenerator<CiInvocationTreeEvent> {
  const query = new URLSearchParams({
    attempt: String(options.attempt),
    follow: '1',
  });
  return readNdjson<CiInvocationTreeEvent>(
    client,
    `/v1/vercel-ci/invocations/${encodeURIComponent(invocationId)}/tree?${query}`,
    { accountId: options.accountId, signal: options.signal }
  );
}

export async function getLatestCiAttempt(
  client: Client,
  invocationId: string,
  accountId?: string
): Promise<number> {
  const { attempts } = await client.fetch<{ attempts: CiInvocation[] }>(
    `/v1/vercel-ci/invocations/${encodeURIComponent(invocationId)}/attempts`,
    { accountId }
  );
  return Math.max(1, ...attempts.map(attempt => attempt.attempt));
}

export type CiTaskLogs = {
  tasks: Array<{
    jobDefinitionId: string;
    jobName: string;
    jobRunAttempt: number;
    taskDefinitionId: string;
    taskName: string;
    taskRunAttempt?: number;
    conclusion?: CiTaskConclusion;
    lines: CiLogLine[];
  }>;
  hasMore: boolean;
};

export type CiLogSearch = {
  invocations: Array<{
    invocationId: string;
    attempt: number;
    tasks: CiTaskLogs['tasks'];
  }>;
  hasMore: boolean;
};

export function searchCiLogs(
  client: Client,
  runs: ReadonlyArray<{ invocationId: string; attempt: number }>,
  filters: { search: string; levels?: readonly string[] },
  accountId?: string
): Promise<CiLogSearch> {
  const query = new URLSearchParams();
  for (const run of runs) {
    query.append('invocation', `${run.invocationId}:${run.attempt}`);
  }
  query.set('search', filters.search);
  for (const level of filters.levels ?? []) query.append('level', level);
  return client.fetch<CiLogSearch>(`/v1/vercel-ci/log-search?${query}`, {
    accountId,
  });
}

export function getCiTaskLogs(
  client: Client,
  invocationId: string,
  attempt: number,
  filters: {
    tasks?: readonly string[];
    conclusions?: readonly string[];
    levels?: readonly string[];
    search?: string;
    limit?: number;
  },
  accountId?: string
): Promise<CiTaskLogs> {
  const query = new URLSearchParams();
  for (const task of filters.tasks ?? []) query.append('task', task);
  for (const conclusion of filters.conclusions ?? []) {
    query.append('conclusion', conclusion);
  }
  for (const level of filters.levels ?? []) query.append('level', level);
  if (filters.search) query.set('search', filters.search);
  if (filters.limit) query.set('limit', String(filters.limit));
  const suffix = query.size ? `?${query}` : '';
  return client.fetch<CiTaskLogs>(
    `/v1/vercel-ci/invocations/${encodeURIComponent(invocationId)}/attempts/${attempt}/task-logs${suffix}`,
    { accountId }
  );
}

export type CiTaskRunLocator = {
  invocationId: string;
  attempt: number;
  jobDefinitionId: string;
  jobRunAttempt: number;
  taskDefinitionId: string;
  taskRunAttempt: number;
};

export function streamCiTaskRunLogs(
  client: Client,
  locator: CiTaskRunLocator,
  options: {
    since?: number;
    levels?: readonly string[];
    accountId?: string;
    signal?: AbortSignal;
  }
): AsyncGenerator<CiLogLine> {
  const query = new URLSearchParams({ follow: '1' });
  if (options.since !== undefined) query.set('since', String(options.since));
  for (const level of options.levels ?? []) query.append('level', level);
  return readNdjson<CiLogLine>(
    client,
    `${ciTaskRunLogsPath(locator)}?${query}`,
    { accountId: options.accountId, signal: options.signal }
  );
}

/** Read a full snapshot, without the follow handler's timestamp cursor. */
export async function getCiTaskRunLogs(
  client: Client,
  locator: CiTaskRunLocator,
  options: { levels?: readonly string[]; accountId?: string } = {}
): Promise<{ lines: CiLogLine[] }> {
  const query = new URLSearchParams();
  for (const level of options.levels ?? []) query.append('level', level);
  const suffix = query.size ? `?${query}` : '';
  let snapshot: { lines: CiLogLine[] } | undefined;
  // Reuse the bounded reader so parsing happens outside client.fetch's retry
  // loop and oversized snapshots are rejected before allocating their JSON.
  for await (const value of readNdjson<unknown>(
    client,
    `${ciTaskRunLogsPath(locator)}${suffix}`,
    { accountId: options.accountId }
  )) {
    if (
      snapshot ||
      typeof value !== 'object' ||
      value === null ||
      !('lines' in value) ||
      !Array.isArray(value.lines)
    ) {
      throw new Error('Invalid Vercel CI log snapshot.');
    }
    snapshot = value as { lines: CiLogLine[] };
  }
  if (!snapshot) throw new Error('Missing Vercel CI log snapshot.');
  return snapshot;
}

function ciTaskRunLogsPath(locator: CiTaskRunLocator): string {
  const path = [
    'invocations',
    locator.invocationId,
    'attempts',
    locator.attempt,
    'job-definitions',
    locator.jobDefinitionId,
    'runs',
    locator.jobRunAttempt,
    'task-definitions',
    locator.taskDefinitionId,
    'runs',
    locator.taskRunAttempt,
    'logs',
  ]
    .map(segment => encodeURIComponent(String(segment)))
    .join('/');
  return `/v1/vercel-ci/${path}`;
}

export async function getCiSetupLogs(
  client: Client,
  invocationId: string,
  attempt: number,
  options: { levels?: readonly string[]; accountId?: string } = {}
): Promise<{ failed: boolean; lines: CiLogLine[] }> {
  const base = `/v1/vercel-ci/invocations/${encodeURIComponent(invocationId)}/attempts/${attempt}`;
  const { invocation } = await client.fetch<{ invocation: CiInvocation }>(
    base,
    { accountId: options.accountId }
  );
  if (invocation.setupConclusion?.result !== 'failed') {
    return { failed: false, lines: [] };
  }
  const query = new URLSearchParams();
  for (const level of options.levels ?? []) query.append('level', level);
  const suffix = query.size ? `?${query}` : '';
  const { lines } = await client.fetch<{ lines: CiLogLine[] }>(
    `${base}/logs${suffix}`,
    { accountId: options.accountId }
  );
  return { failed: true, lines };
}

export function retryCiInvocation(
  client: Client,
  invocationId: string,
  attempt: number,
  accountId?: string
): Promise<{ invocationId: string; attempt: number }> {
  return client.fetch<{ invocationId: string; attempt: number }>(
    `/v1/vercel-ci/invocations/${encodeURIComponent(invocationId)}/attempts/${attempt}/retry`,
    { method: 'POST', accountId }
  );
}

export type CiRepositoryRef = {
  provider: CiGitProvider;
  /** The Git provider's owner (organization or user) login. */
  organizationId: string;
  /** The repository name, without the owner. */
  repository: string;
};

export type CiRepositorySettings = CiRepositoryRef & {
  ciEnabled: boolean;
  ciEnabledAt?: number;
  updatedAt?: number;
};

function repositorySettingsPath(repo: CiRepositoryRef): string {
  const query = new URLSearchParams({
    provider: repo.provider,
    organizationId: repo.organizationId,
    repository: repo.repository,
  });
  return `/v1/vercel-ci/repository-settings?${query}`;
}

export function getCiRepositorySettings(
  client: Client,
  repo: CiRepositoryRef,
  accountId?: string
): Promise<CiRepositorySettings> {
  return client.fetch<CiRepositorySettings>(repositorySettingsPath(repo), {
    accountId,
  });
}

/** Setting `ciEnabled` to its current value is a no-op, so this is idempotent. */
export function updateCiRepositorySettings(
  client: Client,
  repo: CiRepositoryRef,
  settings: { ciEnabled: boolean },
  accountId?: string
): Promise<CiRepositorySettings> {
  return client.fetch<CiRepositorySettings>(repositorySettingsPath(repo), {
    method: 'PATCH',
    body: settings,
    accountId,
  });
}
