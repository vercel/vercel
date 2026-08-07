import type Client from '../../util/client';
import type { ProjectLinkResult } from '@vercel-internals/types';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { isAPIError } from '../../util/errors-ts';
import { printError } from '../../util/error';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { parseTimeFlag } from '../../util/time-utils';

const AGENT_RUNS_API_BASE = 'https://vercel.com/api/observability/agent-runs';

export const DEFAULT_TRACE_MAX_FIELD_LENGTH = 8000;
export const MAX_TRACE_FIELD_LENGTH = 50000;

export function getAgentRunsApiBase(): string {
  return process.env.VERCEL_AGENT_RUNS_API_URL || AGENT_RUNS_API_BASE;
}

export interface AgentRunsQuery {
  teamId: string;
  projectId?: string;
  environment?: string;
  since?: string;
  until?: string;
  view?: 'team';
  page?: number;
  pageSize?: number;
  search?: string;
  runId?: string;
  trace?: boolean;
}

export function buildAgentRunsUrl(query: AgentRunsQuery): string {
  const url = new URL(getAgentRunsApiBase());
  url.searchParams.set('teamSlug', query.teamId);
  if (query.view === 'team') {
    url.searchParams.set('view', 'team');
  } else if (query.projectId) {
    url.searchParams.set('project', query.projectId);
  }
  url.searchParams.set('environment', query.environment || 'production');
  if (query.since) {
    const from = parseTimeFlag(query.since);
    const to = query.until ? parseTimeFlag(query.until) : new Date();
    url.searchParams.set('from', String(Math.floor(from.getTime() / 1000)));
    url.searchParams.set('to', String(Math.floor(to.getTime() / 1000)));
  }
  if (typeof query.page === 'number') {
    url.searchParams.set('page', String(Math.max(1, Math.floor(query.page))));
  }
  if (typeof query.pageSize === 'number') {
    url.searchParams.set(
      'pageSize',
      String(Math.max(1, Math.floor(query.pageSize)))
    );
  }
  if (query.search) {
    url.searchParams.set('search', query.search);
  }
  if (query.runId) {
    url.searchParams.set('runId', query.runId);
  }
  if (query.trace) {
    url.searchParams.set('trace', '1');
  }
  return url.href;
}

export async function fetchAgentRuns<T = Record<string, unknown>>(
  client: Client,
  query: AgentRunsQuery
): Promise<T> {
  return client.fetch<T>(buildAgentRunsUrl(query), { useCurrentTeam: false });
}

const MISSING_PROJECT_SCOPE_MESSAGE =
  'No linked project found. Run `vercel link`, pass --cwd to a linked dir, or use --scope <team> and --project <name>.';
const MISSING_TEAM_SCOPE_MESSAGE =
  'No team scope found. Run `vercel link`, pass --cwd to a linked dir, or use --scope <team>.';

export type AgentRunsScope =
  | {
      ok: true;
      teamId: string;
      projectId: string | undefined;
      contextName: string;
    }
  | { ok: false; exitCode: number };

export async function resolveAgentRunsScope(
  client: Client,
  {
    scopeFlag,
    projectFlag,
    requireProject,
  }: {
    scopeFlag: string | undefined;
    projectFlag: string | undefined;
    requireProject: boolean;
  }
): Promise<AgentRunsScope> {
  const flagScope = scopeFlag?.trim() || undefined;
  const flagProject = projectFlag?.trim() || undefined;

  if (flagScope && (flagProject || !requireProject)) {
    return {
      ok: true,
      teamId: flagScope,
      projectId: flagProject,
      contextName: flagProject ? `${flagScope}/${flagProject}` : flagScope,
    };
  }

  const linkedProject: ProjectLinkResult = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return { ok: false, exitCode: linkedProject.exitCode };
  }

  if (linkedProject.status === 'linked') {
    const { org, project } = linkedProject;
    if (flagScope && flagScope !== org.id && flagScope !== org.slug) {
      return {
        ok: false,
        exitCode: invalidArguments(
          client,
          `\`--scope ${flagScope}\` doesn't match the linked project's team. Pass \`--project <name>\` to query a project in that team.`
        ),
      };
    }
    const teamName = flagScope ?? org.slug;
    const projectName = requireProject
      ? (flagProject ?? project.name)
      : flagProject;
    return {
      ok: true,
      teamId: flagScope ?? org.id,
      projectId: requireProject ? (flagProject ?? project.id) : flagProject,
      contextName: projectName ? `${teamName}/${projectName}` : teamName,
    };
  }

  const message = requireProject
    ? MISSING_PROJECT_SCOPE_MESSAGE
    : MISSING_TEAM_SCOPE_MESSAGE;
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.NOT_LINKED,
    message,
  });
  output.error(message);
  return { ok: false, exitCode: 1 };
}

function normalizeApiErrorText(message: string): string {
  return message.replace(/\s*\(\d{3}\)\s*$/, '').trim();
}

export function handleAgentRunsApiError(client: Client, err: unknown): void {
  if (isAPIError(err)) {
    const reason =
      err.status === 403
        ? 'forbidden'
        : err.status === 401
          ? 'not_authorized'
          : err.status === 404
            ? AGENT_REASON.NOT_FOUND
            : err.status === 429
              ? 'rate_limited'
              : AGENT_REASON.API_ERROR;
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason,
      message: normalizeApiErrorText(err.serverMessage || err.message),
    });
  } else {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: 'unexpected_error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
  printError(err);
}

export function invalidArguments(client: Client, message: string): number {
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message,
  });
  output.error(message);
  return 1;
}

export function normalizeTraceMaxFieldLength(
  value: number | undefined
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TRACE_MAX_FIELD_LENGTH;
  }
  return Math.min(Math.max(Math.floor(value), 0), MAX_TRACE_FIELD_LENGTH);
}

export function truncateLargeStrings(
  value: unknown,
  maxLength: number
): unknown {
  if (maxLength === 0) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
  }
  if (Array.isArray(value)) {
    return value.map(item => truncateLargeStrings(item, maxLength));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        truncateLargeStrings(entry, maxLength),
      ])
    );
  }
  return value;
}
