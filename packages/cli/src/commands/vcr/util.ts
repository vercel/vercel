import type Client from '../../util/client';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type { VcrScope } from './resolve-vcr-scope';

function baseQuery(scope: VcrScope): URLSearchParams {
  return new URLSearchParams({
    teamId: scope.teamId,
    projectId: scope.projectId,
  });
}

export function repositoriesPath(
  scope: VcrScope,
  opts: { limit?: number; cursor?: string } = {}
): string {
  const query = baseQuery(scope);
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  return `/v1/vcr/repository?${query.toString()}`;
}

export function repositoryPath(scope: VcrScope, idOrName: string): string {
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}?${baseQuery(scope).toString()}`;
}

export function repositoryImagesPath(
  scope: VcrScope,
  idOrName: string,
  opts: { limit?: number; cursor?: string; untagged?: boolean } = {}
): string {
  const query = baseQuery(scope);
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  if (opts.untagged) {
    query.set('untagged', 'true');
  }
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/images?${query.toString()}`;
}

export function imagePath(
  scope: VcrScope,
  idOrName: string,
  imageId: string
): string {
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/images/${encodeURIComponent(imageId)}?${baseQuery(scope).toString()}`;
}

export function repositoryTagsPath(
  scope: VcrScope,
  idOrName: string,
  opts: {
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}
): string {
  const query = baseQuery(scope);
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  if (opts.sortBy) {
    query.set('sortBy', opts.sortBy);
  }
  if (opts.sortOrder) {
    query.set('sortOrder', opts.sortOrder);
  }
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/tags?${query.toString()}`;
}

/**
 * Maps a VCR API error to a machine-readable agent payload (non-interactive)
 * and a human-readable message, returning exit code 1.
 */
export function handleVcrApiError(
  client: Client,
  err: { status: number; code?: string; serverMessage?: string },
  jsonOutput: boolean,
  opts: { retry?: { command: string; when?: string } } = {}
): number {
  const message =
    err.status === 401 || err.status === 403
      ? 'You do not have access to the container registry in this scope. Ensure your role can manage the project, or pass --token and --scope.'
      : err.status >= 500
        ? `The container registry endpoint failed (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
        : err.serverMessage || `API error (${err.status}).`;

  const reason =
    err.status === 401
      ? 'not_authorized'
      : err.status === 403
        ? 'forbidden'
        : err.status === 404
          ? AGENT_REASON.NOT_FOUND
          : err.status === 409
            ? 'conflict'
            : err.status === 429
              ? 'rate_limited'
              : AGENT_REASON.API_ERROR;

  const next: Array<{ command: string; when?: string }> = [];
  if (err.status === 401 || err.status === 403) {
    next.push({
      command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
      when: 'See current user and team',
    });
  }
  if (opts.retry) {
    next.push(opts.retry);
  }

  outputAgentError(
    client,
    {
      status: 'error',
      reason,
      message,
      ...(err.status === 401 || err.status === 403
        ? {
            hint: 'Confirm team scope with whoami; use --scope <team-slug> if the repository lives under another team.',
          }
        : {}),
      ...(next.length > 0 ? { next } : {}),
    },
    1
  );

  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

/**
 * Non-interactive: emits a JSON arg-parse error payload and exits. Interactive:
 * no-op (the caller prints the raw error to stderr via `printError`).
 */
export function emitVcrArgParseError(
  client: Client,
  err: unknown,
  recoverTemplate: string
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const projectFlagMissingArg =
    msg.includes('--project') && msg.includes('requires argument');
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: projectFlagMissingArg
        ? '`--project` requires a project name or id (for example `--project my-app`).'
        : msg,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, recoverTemplate),
          when: projectFlagMissingArg
            ? 'Re-run with a project name or id (replace placeholder)'
            : 'See valid usage',
        },
      ],
    },
    1
  );
}
