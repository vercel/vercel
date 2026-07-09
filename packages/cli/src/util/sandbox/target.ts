import type Client from '../client';
import getScope from '../get-scope';
import getProjectByNameOrId from '../projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../errors-ts';
import { getLinkedProject } from '../projects/link';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON } from '../agent-output-constants';

/**
 * Thrown by resolveSandboxTarget on any resolution failure. `exitCode` mirrors
 * the exit code of whatever it wraps (e.g. getLinkedProject's own exitCode),
 * so PR #2's native sandbox commands can `return err.exitCode` on catch
 * instead of always assuming 1.
 */
export class SandboxTargetError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'SandboxTargetError';
    this.exitCode = exitCode;
  }
}

function resolveToken(client: Client): string | undefined {
  return client.authConfig.token ?? process.env.VERCEL_AUTH_TOKEN;
}

function failSandboxTarget(
  client: Client,
  reason: string,
  message: string,
  exitCode = 1
): never {
  outputAgentError(client, { status: 'error', reason, message }, exitCode);
  throw new SandboxTargetError(message, exitCode);
}

/**
 * Resolves the `{ token, teamId, projectId }` a native sandbox command needs
 * to call the Sandbox API, following the same team/project resolution shape
 * as resolveVcrScope/resolveAlertsScope: an explicit `--project` is resolved
 * by name-or-id within the team scope, otherwise the local `.vercel` link
 * is used.
 *
 * @param opts.team An already-resolved team ID, expected to be passed by PR #2's native sandbox command tasks.
 */
export async function resolveSandboxTarget(
  client: Client,
  opts: { project?: string; team?: string } = {}
): Promise<{ token: string; teamId: string; projectId: string }> {
  const token = resolveToken(client);
  if (!token) {
    failSandboxTarget(
      client,
      AGENT_REASON.LOGIN_REQUIRED,
      'Not authenticated. Run `vercel login`, or set `VERCEL_TOKEN` (or `VERCEL_AUTH_TOKEN`).'
    );
  }

  if (opts.project) {
    let teamId = opts.team;
    if (!teamId) {
      const scope = await getScope(client);
      teamId = scope.team?.id;
    }
    if (!teamId) {
      failSandboxTarget(
        client,
        AGENT_REASON.MISSING_SCOPE,
        'No team context found. Run `vercel switch` to select a team, or pass `--scope`/`--team`.'
      );
    }

    let projectResult: Awaited<ReturnType<typeof getProjectByNameOrId>>;
    try {
      projectResult = await getProjectByNameOrId(client, opts.project, teamId);
    } catch (err) {
      if (isAPIError(err)) {
        const reason =
          err.status === 401
            ? 'not_authorized'
            : err.status === 403
              ? 'forbidden'
              : AGENT_REASON.API_ERROR;
        const message =
          err.serverMessage ||
          (err.status === 403
            ? `You do not have permission to access project "${opts.project}" in this team.`
            : `API error (${err.status}).`);
        failSandboxTarget(client, reason, message);
      }
      throw err;
    }

    if (projectResult instanceof ProjectNotFound) {
      failSandboxTarget(
        client,
        AGENT_REASON.NOT_FOUND,
        `Project "${opts.project}" was not found in the current team scope.`
      );
    }

    return { token, teamId, projectId: projectResult.id };
  }

  const link = await getLinkedProject(client);

  if (link.status === 'error') {
    failSandboxTarget(
      client,
      AGENT_REASON.NOT_LINKED,
      'Could not resolve the linked project; see the error above, or pass `--project`.',
      link.exitCode
    );
  }

  if (link.status === 'not_linked') {
    failSandboxTarget(
      client,
      AGENT_REASON.NOT_LINKED,
      'Could not determine team/project scope. Pass `--scope` and `--project`, or run `vercel link`.'
    );
  }

  if (opts.team && link.org.id !== opts.team) {
    failSandboxTarget(
      client,
      AGENT_REASON.SCOPE_NOT_ACCESSIBLE,
      `Linked project "${link.project.name}" belongs to team "${link.org.slug}", not the requested team. Pass \`--project\` to use a project in this team.`
    );
  }

  return {
    token,
    teamId: opts.team ?? link.org.id,
    projectId: link.project.id,
  };
}
