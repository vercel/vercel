import type Client from '../../../util/client';
import { outputError } from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import {
  AUTH_FAILURE,
  resolveRegistry,
  stderrTail,
  type VcrEngine,
} from './engine';

type VcrApiError = { status: number; code?: string; serverMessage?: string };

interface StatusInfo {
  reason: string;
  message: (err: VcrApiError) => string;
  hint?: string;
  suggestWhoami?: boolean;
}

const NOT_AUTHORIZED_MESSAGE =
  'You do not have access to the container registry in this scope. Ensure your role can manage the project, or pass --token and --scope.';
const NOT_AUTHORIZED_HINT =
  'Confirm team scope with whoami; use --scope <team-slug> if the repository lives under another team.';
const genericMessage = (err: VcrApiError): string =>
  err.serverMessage || `API error (${err.status}).`;

const STATUS_INFO: Record<number, StatusInfo> = {
  401: {
    reason: 'not_authorized',
    message: () => NOT_AUTHORIZED_MESSAGE,
    hint: NOT_AUTHORIZED_HINT,
    suggestWhoami: true,
  },
  403: {
    reason: 'forbidden',
    message: () => NOT_AUTHORIZED_MESSAGE,
    hint: NOT_AUTHORIZED_HINT,
    suggestWhoami: true,
  },
  404: { reason: AGENT_REASON.NOT_FOUND, message: genericMessage },
  409: { reason: 'conflict', message: genericMessage },
  429: { reason: 'rate_limited', message: genericMessage },
};

function resolveStatusInfo(err: VcrApiError): StatusInfo {
  if (STATUS_INFO[err.status]) {
    return STATUS_INFO[err.status];
  }
  if (err.status >= 500) {
    return {
      reason: AGENT_REASON.API_ERROR,
      message: () =>
        `The container registry endpoint failed (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`,
    };
  }
  return { reason: AGENT_REASON.API_ERROR, message: genericMessage };
}

/**
 * Maps a VCR API error to a machine-readable agent payload (non-interactive)
 * and a human-readable message, returning exit code 1.
 */
export function handleVcrApiError(
  client: Client,
  err: VcrApiError,
  jsonOutput: boolean,
  opts: { retry?: { command: string; when?: string } } = {}
): number {
  const info = resolveStatusInfo(err);
  const message = info.message(err);

  const next: Array<{ command: string; when?: string }> = [];
  if (info.suggestWhoami) {
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
      reason: info.reason,
      message,
      ...(info.hint ? { hint: info.hint } : {}),
      ...(next.length > 0 ? { next } : {}),
    },
    1
  );

  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

/**
 * Reports a non-auth engine command failure (a build, or a push that failed for
 * a reason other than credentials), surfacing the engine's exit code and stderr
 * tail. Always returns 1.
 */
export function reportEngineCommandFailure(
  client: Client,
  engine: VcrEngine,
  verb: string,
  result: { exitCode: number; stderr: string }
): number {
  const tail = stderrTail(result.stderr);
  const message = `\`${engine} ${verb}\` failed (exit code ${result.exitCode}).${
    tail ? `\n${tail}` : ''
  }`;
  outputAgentError(
    client,
    {
      status: 'error',
      reason: 'command_failed',
      message,
    },
    1
  );
  return outputError(client, false, 'COMMAND_FAILED', message);
}

/**
 * Reports a failed engine operation that talks to the registry (a push, or a
 * fused Buildx build+push). An auth-failure signature hints re-login; anything
 * else surfaces the engine's exit code and stderr tail. Always returns 1.
 */
export function reportEnginePushFailure(
  client: Client,
  engine: VcrEngine,
  verb: string,
  result: { exitCode: number; stderr: string }
): number {
  if (AUTH_FAILURE.test(result.stderr)) {
    const message = `Push to ${resolveRegistry()} was rejected. Your registry credentials may be missing or expired.`;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'not_authorized',
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `vcr login ${engine}`
            ),
            when: 'Refresh registry credentials (valid ~12 hours)',
          },
        ],
      },
      1
    );
    return outputError(client, false, 'NOT_AUTHORIZED', message);
  }

  return reportEngineCommandFailure(client, engine, verb, result);
}

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
