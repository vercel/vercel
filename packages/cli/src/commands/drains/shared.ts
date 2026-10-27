import type arg from 'arg';
import type Client from '../../util/client';
import output from '../../output-manager';
import { withGlobalFlags } from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import type { Drain } from '../../util/drains/api';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { writeJsonError } from '../../util/observability/jsonl';
import cmd from '../../util/output/cmd';
import { remoteText } from '../../util/output/remote-text';
import { printError } from '../../util/error';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import type { CommandOption } from '../help';

const DRAIN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,256}$/;

export interface NextStep {
  /**
   * A `drains …` command, without `vercel` or global flags, unless `full` is
   * set and it's already a complete command.
   */
  command: string;
  when: string;
  full?: boolean;
}

export interface Failure {
  reason: string;
  message: string;
  next?: NextStep[];
  /** An attributed detail row, such as the API's own message. */
  detail?: string;
  /** One row per invalid input, reported together. */
  issues?: Array<{ field: string; message: string }>;
  /** A URL to recover with when no command can, such as a dashboard page. */
  link?: { when: string; url: string };
  data?: Record<string, unknown>;
  userActionRequired?: boolean;
}

/** A runnable `vercel drains …` command that keeps the run's global flags. */
export function drainsCommand(client: Client, command: string): string {
  return withGlobalFlags(client, `drains ${command}`);
}

/**
 * Errors are JSON on stderr with `--json` or in a non-interactive run, so
 * agents and scripts can branch on `reason`.
 */
export function reportsJsonErrors(client: Client, json: boolean): boolean {
  return json || client.nonInteractive;
}

/** Reports a failure and returns its exit code. */
export function fail(
  client: Client,
  json: boolean,
  failure: Failure,
  exitCode = getExitCodeForReason(failure.reason)
): number {
  output.stopSpinner();
  const next = failure.next?.map(step => ({
    command: step.full ? step.command : drainsCommand(client, step.command),
    when: step.when,
  }));
  if (reportsJsonErrors(client, json)) {
    return writeJsonError(
      client,
      {
        // The command succeeds once the caller adds --yes, so a missing
        // confirmation is an action, not an error.
        status: (failure.reason === AGENT_REASON.CONFIRMATION_REQUIRED
          ? AGENT_STATUS.ACTION_REQUIRED
          : AGENT_STATUS.ERROR) as typeof AGENT_STATUS.ERROR,
        reason: failure.reason,
        message: failure.message,
        ...(next?.length ? { next } : {}),
        ...(failure.userActionRequired ? { userActionRequired: true } : {}),
        ...(failure.data || failure.issues || failure.link
          ? {
              data: {
                ...failure.data,
                ...(failure.link ? { url: failure.link.url } : {}),
                ...(failure.issues
                  ? {
                      issues: failure.issues.map(issue => ({
                        ...issue,
                        reason: AGENT_REASON.INVALID_ARGUMENTS,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
      },
      exitCode
    );
  }
  output.fatal(failure.message);
  if (failure.detail) {
    output.print(`  ${failure.detail}\n`);
  }
  for (const issue of failure.issues ?? []) {
    output.print(`  ${`--${issue.field}`.padEnd(16)}${issue.message}\n`);
  }
  for (const step of next ?? []) {
    output.print(`\n  ${step.when}:\n    ${cmd(step.command)}\n`);
  }
  if (failure.link) {
    output.print(`\n  ${failure.link.when}:\n    ${failure.link.url}\n`);
  }
  return exitCode;
}

/** Reports invalid input before any request. Exits 2. */
export function usageError(
  client: Client,
  json: boolean,
  message: string,
  helpCommand: string
): number {
  return fail(client, json, {
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message,
    next: [{ command: `${helpCommand} --help`, when: 'See all options' }],
  });
}

/**
 * Parses a subcommand's argv strictly and records which options were used.
 * Returns the exit code when the input can't be parsed.
 */
export function parseSubcommand<T extends ReadonlyArray<CommandOption>>(
  client: Client,
  argv: string[],
  options: T,
  path: string
) {
  const json = argv.includes('--json');
  let parsed;
  try {
    const spec = getFlagsSpecification(options);
    parsed = parseArguments(argv, spec as typeof spec & arg.Spec);
  } catch (err) {
    return usageError(
      client,
      json,
      err instanceof Error ? err.message : String(err),
      path
    );
  }
  new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  }).trackOptions(parsed.flags);
  return {
    args: parsed.args,
    flags: parsed.flags,
    json: Boolean((parsed.flags as { '--json'?: boolean })['--json']),
  };
}

/** Reads the one drain ID a subcommand takes. */
export function readDrainId(
  client: Client,
  json: boolean,
  args: string[],
  path: string,
  verb: string
): string | number {
  if (args.length === 0) {
    return fail(client, json, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: `Can't ${verb} a drain without its ID.`,
      next: [
        { command: 'list', when: 'Find the drain ID' },
        {
          command: `${path.replace(/^drains /, '')} <DRAIN>`,
          when: 'Then pass it, replacing <DRAIN>',
        },
      ],
    });
  }
  if (args.length > 1) {
    return usageError(
      client,
      json,
      `vercel ${path} takes one drain ID. Got ${args.length} arguments.`,
      path
    );
  }
  if (!DRAIN_ID_PATTERN.test(args[0])) {
    return usageError(
      client,
      json,
      'A drain ID uses letters, numbers, underscores, and hyphens, like drn_a1b2c3d4e5f6g7h8.',
      path
    );
  }
  return args[0];
}

/**
 * A drain as JSON. The API returns the signing secret and header values in
 * plaintext, and either can hold a credential, so the secret is dropped and
 * header values are redacted.
 */
export function redactDrain(drain: Drain): Drain {
  if (!drain.delivery) return drain;
  const { secret: _secret, ...delivery } = drain.delivery;
  if (delivery.headers) {
    delivery.headers = Object.fromEntries(
      Object.keys(delivery.headers).map(name => [name, '[REDACTED]'])
    );
  }
  return { ...drain, delivery } as Drain;
}

/** The JSON `next` of a mutation: the command that inspects the drain. */
export function inspectNext(client: Client, id: string) {
  return [
    {
      command: drainsCommand(client, `inspect ${id}`),
      when: 'Inspect the drain',
    },
  ];
}

export function printJson(client: Client, document: unknown): number {
  output.stopSpinner();
  client.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  return 0;
}

/**
 * Writes a mutated drain's ID to stdout so `id=$(vercel drains create …)`
 * works. An interactive terminal already shows it in the receipt.
 */
export function printStdoutIdentifier(client: Client, id: string): void {
  if (client.stdout.isTTY && !client.nonInteractive) return;
  client.stdout.write(`${id}\n`);
}

/** Starts a spinner in interactive human mode only. */
export function progress(client: Client, json: boolean, message: string): void {
  if (!json && !client.nonInteractive) output.spinner(message);
}

export interface FailedAction {
  /** The verb and object, such as `update drain drn_123`. */
  action: string;
  /** The drain the request named, for the not-found error. */
  drainId?: string;
}

/**
 * Translates a drains API failure into CLI copy. The API's own message is
 * remote text, so it only appears in an attributed detail row and in
 * `data.remoteMessage`.
 */
export function handleApiError(
  client: Client,
  json: boolean,
  err: unknown,
  failed: FailedAction
): number {
  if (!isAPIError(err)) throw err;

  const remote = err.serverMessage ? remoteText(err.serverMessage) : '';
  const withRemote = (failure: Failure): Failure =>
    remote
      ? {
          ...failure,
          detail: `Vercel API: ${remote}`,
          data: { ...failure.data, remoteMessage: remote },
        }
      : failure;

  if (err.status === 404 && failed.drainId) {
    return fail(client, json, {
      reason: AGENT_REASON.NOT_FOUND,
      message: `Couldn't find drain ${failed.drainId}.`,
      next: [{ command: 'list', when: 'List your drains' }],
    });
  }
  if (err.code === 'drain_enable_not_allowed') {
    return fail(
      client,
      json,
      withRemote({
        reason: AGENT_REASON.CONFLICT,
        message: `Can't ${failed.action}. Vercel disabled it.`,
      })
    );
  }
  if (err.status === 403) {
    return fail(
      client,
      json,
      withRemote({
        reason: AGENT_REASON.PERMISSION_DENIED,
        message: `You can't ${failed.action}.`,
      })
    );
  }
  if (err.status === 429) {
    return fail(client, json, {
      reason: AGENT_REASON.RATE_LIMITED,
      message: 'Too many requests to the Vercel API. Try again later.',
    });
  }
  if (err.status === 400) {
    return fail(
      client,
      json,
      withRemote({
        reason: AGENT_REASON.API_ERROR,
        message: `Couldn't ${failed.action}. The API rejected the request.`,
      })
    );
  }
  return fail(
    client,
    json,
    withRemote({
      reason: AGENT_REASON.API_ERROR,
      message: `Failed to ${failed.action}.`,
      data: { httpStatus: err.status },
    })
  );
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  const cause = (err as { cause?: { code?: unknown } }).cause;
  return (
    (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) ||
    (typeof cause?.code === 'string' && NETWORK_ERROR_CODES.has(cause.code)) ||
    err.name === 'FetchError' ||
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    /fetch failed/i.test(err.message)
  );
}

/**
 * Reports an error that isn't an API response: a request that never got a
 * response, or a bug. With `--json` or in a non-interactive run it's still
 * one JSON error document, so the error contract holds.
 */
export function handleUnexpectedError(
  client: Client,
  json: boolean,
  err: unknown
): number {
  output.stopSpinner();
  if (isNetworkError(err)) {
    let host = 'the Vercel API';
    try {
      host = new URL(client.apiUrl).host;
    } catch {}
    return fail(client, json, {
      reason: AGENT_REASON.NETWORK_ERROR,
      message: `Couldn't reach ${host}. The connection failed.`,
    });
  }
  if (reportsJsonErrors(client, json)) {
    return writeJsonError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: 'internal_error',
        message:
          'Unexpected error in vercel drains. This is a bug in Vercel CLI.',
      },
      1
    );
  }
  printError(err, client);
  return 1;
}
