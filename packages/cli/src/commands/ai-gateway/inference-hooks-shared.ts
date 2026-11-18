import type arg from 'arg';
import type Client from '../../util/client';
import output from '../../output-manager';
import { buildCommandWithYes, withGlobalFlags } from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import type {
  InferenceHookHeader,
  InferenceHooksConfig,
} from '../../util/ai-gateway/inference-hooks';
import { canPrompt } from '../../util/can-prompt';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { writeJsonError } from '../../util/observability/jsonl';
import { helpCommand } from '../../util/output/help-format';
import { createHelpTheme } from '../../util/output/help-theme';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { remoteText } from '../../util/output/remote-text';
import type { InferenceHooksLeafTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import type { Command, CommandOption } from '../help';
import { inferenceHooksSubcommand } from './command';

export const GROUP = 'ai-gateway inference-hooks';

function flatten(command: Command): Command[] {
  return [command, ...(command.subcommands ?? []).flatMap(flatten)];
}

/** Every option in the tree, so routing knows which ones take a value. */
export const routingFlags = getFlagsSpecification(
  flatten(inferenceHooksSubcommand).flatMap(
    (command): ReadonlyArray<CommandOption> => command.options
  )
);

export interface NextStep {
  /** A command after `vercel ai-gateway inference-hooks`, unless `full`. */
  command: string;
  when: string;
  full?: boolean;
  placeholders?: string[];
}

export interface Failure {
  reason: string;
  message: string;
  /** Attributed rows after the headline, such as the API's own message. */
  details?: string[];
  issues?: Array<{ field: string; message: string }>;
  next?: NextStep[];
  /** A plain recovery sentence, when no command applies. */
  recovery?: string;
  data?: Record<string, unknown>;
  userActionRequired?: boolean;
  retryable?: boolean;
  retryAfter?: number;
}

export interface Warning {
  reason: string;
  message: string;
}

/**
 * A runnable `vercel ai-gateway inference-hooks …` command with the run's
 * global flags, minus `--yes`: consent never carries over, and reads reject it.
 */
export function groupCommand(client: Client, command: string): string {
  return withGlobalFlags(client, `${GROUP} ${command}`)
    .split(' ')
    .filter(token => token !== '--yes' && token !== '-y')
    .join(' ');
}

function resolveNext(client: Client, next: NextStep[] = []) {
  return next.map(step => ({
    command: step.full ? step.command : groupCommand(client, step.command),
    when: step.when,
    placeholders: step.placeholders,
  }));
}

/** Prints recovery or next steps on stderr, each command on its own line. */
export function printSteps(client: Client, steps: NextStep[]): void {
  const theme = createHelpTheme(client.stderr);
  for (const step of resolveNext(client, steps)) {
    output.print(
      `\n  ${step.when}:\n${helpCommand(step.command, step.placeholders, theme)}\n`
    );
  }
}

/** Reports a failure and returns its exit code. JSON errors need `--json`. */
export function fail(
  client: Client,
  json: boolean,
  failure: Failure,
  exitCode = getExitCodeForReason(failure.reason)
): number {
  output.stopSpinner();
  if (json) {
    const next = resolveNext(client, failure.next).map(({ command, when }) => ({
      command,
      when,
    }));
    const data = {
      ...failure.data,
      ...(failure.issues
        ? {
            issues: failure.issues.map(issue => ({
              ...issue,
              reason: AGENT_REASON.INVALID_ARGUMENTS,
            })),
          }
        : {}),
    };
    return writeJsonError(
      client,
      {
        status: (failure.reason === AGENT_REASON.CONFIRMATION_REQUIRED ||
        failure.reason === AGENT_REASON.MISSING_SCOPE
          ? AGENT_STATUS.ACTION_REQUIRED
          : AGENT_STATUS.ERROR) as typeof AGENT_STATUS.ERROR,
        reason: failure.reason,
        message: failure.message,
        ...(next.length ? { next } : {}),
        ...(failure.userActionRequired ? { userActionRequired: true } : {}),
        ...(failure.retryable !== undefined
          ? { retryable: failure.retryable }
          : {}),
        ...(failure.retryAfter !== undefined
          ? { retryAfter: failure.retryAfter }
          : {}),
        ...(Object.keys(data).length ? { data } : {}),
      },
      exitCode
    );
  }
  output.fatal(failure.message);
  for (const detail of failure.details ?? []) {
    output.print(`  ${detail}\n`);
  }
  for (const issue of failure.issues ?? []) {
    output.print(`  ${`--${issue.field}`.padEnd(16)}${issue.message}\n`);
  }
  if (failure.recovery) {
    output.print(`\n  ${failure.recovery}\n`);
  }
  printSteps(client, failure.next ?? []);
  return exitCode;
}

/** Reports invalid input before any request. Exits 2. */
export function usageError(
  client: Client,
  json: boolean,
  path: string,
  failure: Omit<Failure, 'reason'> & { reason?: string }
): number {
  return fail(client, json, {
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    next: [
      {
        command: withGlobalFlags(client, `${path} --help`),
        when: 'See all options',
        full: true,
      },
    ],
    ...failure,
  });
}

/**
 * Parses a leaf's argv strictly and records which options were used, never
 * their values. Returns the exit code when the input can't be parsed.
 */
export function parseLeaf<T extends ReadonlyArray<CommandOption>>(
  client: Client,
  argv: string[],
  options: T,
  path: string,
  telemetry: InferenceHooksLeafTelemetryClient
) {
  const json = argv.includes('--json');
  let parsed;
  try {
    const spec = getFlagsSpecification(options);
    parsed = parseArguments(argv, spec as typeof spec & arg.Spec);
  } catch (err) {
    return usageError(client, json, path, {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const flags = parsed.flags as Record<string, unknown>;
  telemetry.trackParsedOptions(flags);
  const parsedJson = Boolean(flags['--json']);
  if (parsed.args.length > 0) {
    return usageError(client, parsedJson, path, {
      message: `vercel ${path} takes no arguments. Got ${parsed.args.length}.`,
    });
  }
  return { flags, json: parsedJson };
}

/**
 * Resolves the team every request is scoped to. `--json` never prompts, so it
 * fails with `missing_scope` instead of asking.
 */
export async function requireTeam(
  client: Client,
  json: boolean,
  path: string
): Promise<true | number> {
  if (json) {
    // `ask: false`: an agent run with several teams leaves the team unchosen
    // instead of stopping with the shared prompt's own error document.
    if (await client.resolveCurrentTeam({ ask: false })) return true;
    return fail(
      client,
      json,
      {
        reason: AGENT_REASON.MISSING_SCOPE,
        message: `Can't run vercel ${path} without a team. Inference hooks belong to a team.`,
        next: [
          {
            command: withGlobalFlags(client, `--scope <TEAM> ${path}`),
            when: 'Pass the team with --scope',
            full: true,
          },
        ],
        userActionRequired: true,
      },
      2
    );
  }
  return (await ensureTeam(client)) ? true : 2;
}

export function printJson(client: Client, document: unknown): number {
  output.stopSpinner();
  const text = client.stdout.isTTY
    ? JSON.stringify(document, null, 2)
    : JSON.stringify(document);
  client.stdout.write(`${text}\n`);
  return 0;
}

/** Starts a spinner in interactive human mode only. */
export function progress(client: Client, json: boolean, message: string): void {
  if (!json && !client.nonInteractive) output.spinner(message);
}

export function printWarnings(warnings: Warning[]): void {
  for (const warning of warnings) output.warning(warning.message);
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Reads `--header "Name: value"` options, split on the first `:`. Values can
 * hold credentials, so an issue names the header's position, never its value.
 */
export function readHeaders(
  values: string[] | undefined,
  issues: Array<{ field: string; message: string }>
): InferenceHookHeader[] | undefined {
  if (values === undefined) return undefined;
  const headers: InferenceHookHeader[] = [];
  for (const [index, raw] of values.entries()) {
    const separator = raw.indexOf(':');
    const name = separator === -1 ? '' : raw.slice(0, separator).trim();
    const value = separator === -1 ? '' : raw.slice(separator + 1).trim();
    if (!HEADER_NAME.test(name) || !value || CONTROL_CHARACTERS.test(value)) {
      issues.push({
        field: 'header',
        message: `Header ${index + 1} must look like "Name: value".`,
      });
      continue;
    }
    headers.push({ name, value });
  }
  return headers;
}

/** Checks the URL's shape only; the API applies the full rules. Never echoes it. */
export function readEndpointUrl(
  value: string | undefined,
  issues: Array<{ field: string; message: string }>
): string | undefined {
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push({
      field: 'endpoint-url',
      message: 'Use a full URL, like https://security.example.com/hook.',
    });
    return undefined;
  }
  if (url.protocol !== 'https:') {
    issues.push({ field: 'endpoint-url', message: 'Use an https URL.' });
    return undefined;
  }
  return value;
}

export function readInteger(
  value: number | undefined,
  field: string,
  min: number,
  max: number,
  issues: Array<{ field: string; message: string }>
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push({
      field,
      message: `Use a whole number from ${min} to ${max}.`,
    });
    return undefined;
  }
  return value;
}

export function readChoice<T extends string>(
  value: string | undefined,
  field: string,
  allowed: readonly T[],
  issues: Array<{ field: string; message: string }>
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    issues.push({ field, message: `Use ${allowed.join(' or ')}.` });
    return undefined;
  }
  return value as T;
}

export function formatTime(timestamp: number | null | undefined): string {
  return typeof timestamp === 'number'
    ? new Date(timestamp).toISOString()
    : '-';
}

/** Aligned rows describing a saved configuration. Header values are never shown. */
export function formatConfigRows(
  config: Extract<InferenceHooksConfig, { configured: true }>
): string[] {
  const names = config.headers?.names ?? [];
  return [
    formatAlignedLabel('Status', config.enabled ? 'Enabled' : 'Disabled'),
    formatAlignedLabel('Endpoint URL', remoteText(config.endpointUrl)),
    formatAlignedLabel('Mode', remoteText(String(config.mode))),
    formatAlignedLabel('Failure Mode', remoteText(String(config.failureMode))),
    formatAlignedLabel('Timeout', `${config.timeoutMs} ms`),
    formatAlignedLabel('Rollout', `${config.rolloutPercent}%`),
    formatAlignedLabel(
      'Headers',
      names.length ? names.map(remoteText).join(', ') : 'None'
    ),
    formatAlignedLabel('Updated', formatTime(config.updatedAt)),
  ];
}

/**
 * Asks before a destructive change. `--yes` is consent; without it, a run
 * that can't prompt fails with `confirmation_required` and the preview in
 * `data.effects`, so an agent asks a person first. Returns true to go ahead.
 */
export async function confirmOrFail(
  client: Client,
  json: boolean,
  opts: {
    yes: boolean;
    preview: string[];
    question: string;
    /** The verb and object, such as `rotate the signing secret`. */
    action: string;
    /** What happens, for the agent's `when`, in lowercase. */
    consequence: string;
    effects: string[];
    /** Replaces the rerun-with-`--yes` step, when argv can't be echoed. */
    next?: NextStep[];
  }
): Promise<true | number> {
  if (opts.yes) return true;
  if (json || !canPrompt(client)) {
    return fail(
      client,
      json,
      {
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message: `Can't ${opts.action} without confirmation in non-interactive mode.`,
        next: opts.next ?? [
          {
            command: buildCommandWithYes(client.argv),
            when: `Only after a person approves: ${opts.consequence}`,
            full: true,
          },
        ],
        userActionRequired: true,
        data: { effects: opts.effects },
      },
      2
    );
  }
  output.print(`${opts.preview.join('\n')}\n`);
  const confirmed = await client.input.confirm(opts.question, false);
  if (!confirmed) {
    output.print('  Canceled. Nothing was changed.\n');
    return 130;
  }
  return true;
}

/**
 * In GitHub Actions, masks a secret in the job log before it's printed, in
 * every output format.
 */
export function maskSecretInCi(client: Client, secret: string): void {
  if (process.env.GITHUB_ACTIONS === 'true') {
    client.stderr.write(`::add-mask::${secret}\n`);
  }
}

export interface ApiFailureContext {
  /** The verb and object, such as `save the inference hooks configuration`. */
  action: string;
  /**
   * The request carried header values. Then the API's message is never shown:
   * it's about a request that held a credential.
   */
  carriesSecret?: boolean;
  /**
   * What a 5xx or a lost connection leaves unknown on a write, such as `the
   * signing secret was rotated`. Reads leave it unset.
   */
  unknownOutcome?: string;
  /** Recovery for an unknown outcome (default: `status`). */
  unknownNext?: NextStep[];
  /**
   * A 2xx body that fails to parse leaves the outcome unknown. Its error text
   * is never shown: the body may hold a secret.
   */
  unknownOnUnreadableBody?: boolean;
  /**
   * The request body came from the saved config, not from options, so a 400
   * is an operational failure (exit 1), not a usage error.
   */
  savedInput?: boolean;
  /** The cause shown for a 5xx on a read, by status and API code. */
  serverCause?: (status: number, code: unknown) => string | undefined;
  /** An extra detail row for a 429. */
  rateLimitDetail?: string;
}

function apiHost(client: Client): string {
  try {
    return new URL(client.apiUrl).host;
  } catch {
    return 'the Vercel API';
  }
}

/**
 * Reports a write whose request may have been sent but got no API response.
 * Returns undefined when the error isn't one to report here.
 */
function handleLostWrite(
  client: Client,
  json: boolean,
  err: unknown,
  context: ApiFailureContext
): number | undefined {
  const unknownOutcome = context.unknownOutcome;
  if (!unknownOutcome) return undefined;
  const network =
    isNetworkError(err) ||
    (err instanceof Error &&
      (err.name === 'AbortError' || err.name === 'TimeoutError'));
  if (network && neverConnected(err)) {
    return fail(client, json, {
      reason: AGENT_REASON.NETWORK_ERROR,
      message: `Couldn't reach ${apiHost(client)}. Nothing was changed.`,
    });
  }
  const unreadable =
    context.unknownOnUnreadableBody && err instanceof SyntaxError;
  if (!network && !unreadable) return undefined;
  return fail(client, json, {
    reason: AGENT_REASON.UNKNOWN_OUTCOME,
    message: `Can't confirm whether ${unknownOutcome}. ${
      network
        ? 'The connection failed before a response arrived.'
        : "The response couldn't be read."
    }`,
    next: context.unknownNext ?? [
      { command: 'status', when: 'Check the current state' },
    ],
    retryable: false,
    data: { remote: 'unknown' },
  });
}

/**
 * Translates an inference hooks API failure into CLI copy. The API's own
 * message is remote text: it appears only in an attributed detail row and in
 * `data.remoteMessage`, and never for a request that carried header values.
 */
export function handleApiError(
  client: Client,
  json: boolean,
  err: unknown,
  context: ApiFailureContext
): number {
  if (!isAPIError(err)) {
    const lost = handleLostWrite(client, json, err, context);
    if (lost !== undefined) return lost;
    throw err;
  }
  const { action } = context;
  const status = err.status;
  const remote =
    !context.carriesSecret && status < 500 && err.serverMessage
      ? remoteText(err.serverMessage)
      : '';
  const withRemote = (failure: Failure): Failure =>
    remote && remote !== 'Response Error'
      ? {
          ...failure,
          details: [...(failure.details ?? []), `Vercel API: ${remote}`],
          data: { ...failure.data, remoteMessage: remote },
        }
      : failure;

  if (status === 403) {
    return fail(
      client,
      json,
      withRemote({
        reason: AGENT_REASON.PERMISSION_DENIED,
        message: `You can't ${action}. It needs the AI Gateway Settings permission.`,
        details: [
          "Team owners have it and can grant it to members. App tokens, integrations, and tokens limited to a project can't manage inference hooks.",
        ],
        recovery: 'Ask a team owner for the AI Gateway Settings permission.',
      })
    );
  }
  if (status === 404 && err.code === 'customer_info_not_found') {
    return fail(client, json, {
      reason: AGENT_REASON.NOT_FOUND,
      message: `Can't ${action}. AI Gateway isn't set up for this team yet.`,
    });
  }
  if (status === 400 && context.savedInput) {
    return fail(
      client,
      json,
      withRemote({
        reason: AGENT_REASON.API_ERROR,
        message: `Failed to ${action}. The API rejected the saved configuration.`,
        data: { httpStatus: status },
      }),
      1
    );
  }
  if (status === 400) {
    if (err.code === 'invalid_inference_hooks_endpoint_url') {
      return fail(
        client,
        json,
        withRemote({
          reason: AGENT_REASON.INVALID_URL,
          message: `Can't ${action}. AI Gateway doesn't accept this endpoint URL.`,
          details: [
            'Use an https URL on port 443 with a public hostname, no user name or password, and no IPv6 address.',
          ],
        })
      );
    }
    if (err.code === 'invalid_inference_hooks_headers') {
      return fail(client, json, {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Can't ${action}. AI Gateway doesn't accept one of the headers.`,
        details: [
          'Header names use HTTP token characters, without "_", and can\'t be reserved names. Values use printable ASCII, without a leading or trailing space.',
        ],
      });
    }
    return fail(
      client,
      json,
      withRemote({
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Can't ${action}. The API rejected the request.`,
        details: context.carriesSecret
          ? [
              'Send at most 16 headers, with names up to 128 characters and values up to 4096.',
            ]
          : [],
      })
    );
  }
  if (status === 429) {
    const seconds =
      typeof err.retryAfterMs === 'number'
        ? Math.max(1, Math.ceil(err.retryAfterMs / 1000))
        : undefined;
    return fail(client, json, {
      reason: AGENT_REASON.RATE_LIMITED,
      message: `Too many requests to the Vercel API. Try again in ${
        seconds === undefined
          ? 'a minute'
          : `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
      }.`,
      details: context.rateLimitDetail ? [context.rateLimitDetail] : [],
      ...(seconds !== undefined ? { retryAfter: seconds } : {}),
    });
  }
  if (status >= 500 && context.unknownOutcome) {
    return fail(client, json, {
      reason: AGENT_REASON.UNKNOWN_OUTCOME,
      message: `Can't confirm whether ${context.unknownOutcome}. The Vercel API returned a server error.`,
      next: context.unknownNext ?? [
        { command: 'status', when: 'Check the current state' },
      ],
      retryable: false,
      data: { httpStatus: status, remote: 'unknown' },
    });
  }
  const cause =
    status >= 500
      ? (context.serverCause?.(status, err.code) ??
        'The Vercel API returned a server error.')
      : undefined;
  return fail(
    client,
    json,
    withRemote({
      reason: AGENT_REASON.API_ERROR,
      message: cause ? `Failed to ${action}. ${cause}` : `Failed to ${action}.`,
      data: { httpStatus: status },
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

// Codes for a connection that was never made, so no request reached the API.
const CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function errorCodes(err: unknown): string[] {
  const code = (err as { code?: unknown }).code;
  const cause = (err as { cause?: { code?: unknown } }).cause;
  return [code, cause?.code].filter(
    (value): value is string => typeof value === 'string'
  );
}

function neverConnected(err: unknown): boolean {
  return errorCodes(err).some(code => CONNECT_ERROR_CODES.has(code));
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  const cause = (err as { cause?: { code?: unknown } }).cause;
  return (
    (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) ||
    (typeof cause?.code === 'string' && NETWORK_ERROR_CODES.has(cause.code)) ||
    err.name === 'FetchError' ||
    /fetch failed/i.test(err.message)
  );
}

/**
 * Reports an error that isn't an API response: a request that never got one,
 * or a bug. With `--json` it's still one JSON error document.
 */
export function handleUnexpectedError(
  client: Client,
  json: boolean,
  err: unknown
): number {
  output.stopSpinner();
  if (isNetworkError(err)) {
    return fail(client, json, {
      reason: AGENT_REASON.NETWORK_ERROR,
      message: `Couldn't reach ${apiHost(client)}. The connection failed.`,
      next: [{ command: 'status', when: 'Check the current state' }],
    });
  }
  if (json) {
    return writeJsonError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: 'internal_error',
        message: `Unexpected error in vercel ${GROUP}. This is a bug in Vercel CLI.`,
      },
      1
    );
  }
  printError(err, client);
  return 1;
}
