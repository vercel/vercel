import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { shouldEmitNonInteractiveCommandError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';

interface LogsErrorOptions {
  message: string;
  reason: string;
  next?: Array<{ command: string; when?: string }>;
}

export function shouldUseLogsJson(
  client: Client,
  explicitJson: boolean
): boolean {
  return explicitJson || shouldEmitNonInteractiveCommandError(client);
}

export function argvRequestsLogsJson(argv: string[]): boolean {
  return argv.some(
    (arg, index) =>
      arg === '--json' ||
      arg === '--format=json' ||
      (arg === '--format' && argv[index + 1]?.toLowerCase() === 'json')
  );
}

export function outputLogsError(
  client: Client,
  options: LogsErrorOptions,
  jsonOutput: boolean
): number {
  if (jsonOutput) {
    client.stdout.write(
      `${JSON.stringify({ status: AGENT_STATUS.ERROR, ...options }, null, 2)}\n`
    );
  } else {
    output.error(options.message);
  }
  return 1;
}

export function outputMissingLogsTeam(
  client: Client,
  subcommand: 'inspect' | 'list'
): number {
  const command =
    subcommand === 'inspect'
      ? 'vercel ai-gateway logs inspect <generationId> --scope <team-slug> --json'
      : 'vercel ai-gateway logs list --scope <team-slug> --json';
  client.stdout.write(
    `${JSON.stringify(
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.MISSING_SCOPE,
        message:
          'Provide --scope <team-slug>. No team is selected in non-interactive mode.',
        next: [{ command }],
      },
      null,
      2
    )}\n`
  );
  return 1;
}

export function outputMissingLogsSubcommand(client: Client): number {
  client.stdout.write(
    `${JSON.stringify(
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: 'Choose an AI Gateway logs subcommand.',
        next: [
          {
            command: 'vercel ai-gateway logs list --scope <team-slug> --json',
            when: 'Search and filter AI Gateway requests',
          },
          {
            command:
              'vercel ai-gateway logs inspect <generationId> --scope <team-slug> --json',
            when: 'Inspect one request and its provider attempts',
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return 1;
}

export function outputLogsApiError(
  client: Client,
  error: unknown,
  jsonOutput: boolean,
  retryCommand: string
): number {
  if (!jsonOutput && isAPIError(error)) {
    output.error(error.serverMessage || error.message);
    return 1;
  }
  if (!isAPIError(error)) {
    return outputLogsError(
      client,
      {
        reason: 'unexpected_error',
        message: 'Failed to fetch AI Gateway logs.',
      },
      jsonOutput
    );
  }

  const reason =
    error.status === 401
      ? AGENT_REASON.LOGIN_REQUIRED
      : error.status === 403
        ? AGENT_REASON.PERMISSION_DENIED
        : error.status === 404
          ? AGENT_REASON.NOT_FOUND
          : error.status === 429
            ? 'rate_limited'
            : AGENT_REASON.API_ERROR;
  const message =
    error.status === 401
      ? 'Authentication failed. Pass --token <TOKEN> or set VERCEL_TOKEN.'
      : error.status === 403
        ? 'You do not have permission to read AI Gateway logs for the selected team.'
        : error.status === 404
          ? 'The AI Gateway logs endpoint was not found.'
          : error.status === 429
            ? 'AI Gateway log requests are rate limited. Retry after the limit resets.'
            : error.status >= 500
              ? `The AI Gateway logs endpoint failed (${error.status}). Re-run with --debug and share the Request ID from the failed request.`
              : `Failed to fetch AI Gateway logs (${error.status}).`;
  const next =
    error.status === 401 || error.status === 403
      ? [
          {
            command: 'vercel whoami --scope <team-slug>',
            when: 'Verify the current user and team',
          },
          {
            command: retryCommand,
            when: 'Retry after fixing authentication, team, or permissions',
          },
        ]
      : undefined;

  return outputLogsError(client, { reason, message, next }, jsonOutput);
}
