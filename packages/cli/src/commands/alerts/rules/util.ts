import type Client from '../../../util/client';
import { outputError } from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import type { AlertsScope } from '../resolve-alerts-scope';

export function buildRulesQuery(scope: AlertsScope): URLSearchParams {
  const query = new URLSearchParams({ teamId: scope.teamId });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }
  return query;
}

export function rulesCollectionPath(scope: AlertsScope): string {
  return `/alerts/v2/alert-rules?${buildRulesQuery(scope).toString()}`;
}

export function rulesItemPath(scope: AlertsScope, ruleId: string): string {
  const query = new URLSearchParams({ teamId: scope.teamId });
  return `/alerts/v2/alert-rules/${encodeURIComponent(ruleId)}?${query.toString()}`;
}

export function handleRulesApiError(
  client: Client,
  err: { status: number; code?: string; serverMessage?: string },
  jsonOutput: boolean
): number {
  const message =
    err.status === 401 || err.status === 403
      ? 'You do not have access to alert rules in this scope. Ensure your role can manage Alert Rules, or pass --token and --scope.'
      : err.status >= 500
        ? `The alert rules endpoint failed (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
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

  outputAgentError(
    client,
    {
      status: 'error',
      reason,
      message,
      ...(err.status === 401 || err.status === 403
        ? {
            hint: 'Confirm team scope with whoami; use --scope <team-slug> if the rule lives under another team.',
            next: [
              {
                command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
                when: 'See current user and team',
              },
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts rules ls'
                ),
                when: 'Retry listing rules after fixing scope or permissions',
              },
            ],
          }
        : {}),
    },
    1
  );

  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

/**
 * Non-interactive: JSON on stdout + exit. Interactive: no-op (caller prints to stderr).
 */
export function emitRulesArgParseError(
  client: Client,
  err: unknown,
  recoverWithProjectFlag: string
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
      next: projectFlagMissingArg
        ? [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                recoverWithProjectFlag
              ),
              when: 'Re-run with a project name or id (replace placeholder)',
            },
          ]
        : [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'alerts rules --help'
              ),
              when: 'See valid `alerts rules` subcommands',
            },
          ],
    },
    1
  );
}
