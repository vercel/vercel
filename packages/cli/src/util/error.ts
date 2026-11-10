import type { Response } from './fetch';
import errorOutput from './output/error';
import bytes from 'bytes';
import type { APIError } from './errors-ts';
import { parseRetryAfterHeaderAsMillis } from './errors-ts';
import { getCommandName } from './pkg-name';
import output from '../output-manager';
import type Client from './client';
import { isArgumentError } from './get-args';
import { buildCorrectedCommand } from './command-correction';
import { getErrorRecovery } from './error-recovery';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from './agent-output';
import { trackAgentError } from './telemetry/agent-error';
import { cliErrorFromUnknown, recordCliError } from './telemetry/cli-error';
import pkg from './pkg';

export const error = errorOutput;

export interface ResponseError extends Error {
  status: number;
  serverMessage: string;
  retryAfterMs?: number;
  [key: string]: any;
}

export async function responseError(
  res: Response,
  fallbackMessage: string | null = null,
  parsedBody = {}
) {
  let message = '';
  let bodyError;

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (_err) {
      body = parsedBody;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || {};
    message = bodyError.message;
  }

  if (!message) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  const err = new Error(`${message} (${res.status})`) as ResponseError;

  err.status = res.status;
  err.serverMessage = message;

  // Copy every field that was added manually to the error
  if (bodyError) {
    for (const field of Object.keys(bodyError)) {
      if (field !== 'message') {
        err[field] = bodyError[field];
      }
    }
  }

  if (res.status === 429 || res.status === 503) {
    const parsed = parseRetryAfterHeaderAsMillis(
      res.headers.get('Retry-After')
    );
    // If the retry-after header is missing or malfomed set to 0.  This ensures users will attempt a retry even in these cases.
    err.retryAfterMs = parsed ?? (res.status === 429 ? 0 : undefined);
  }

  return err;
}

export async function responseErrorMessage(
  res: Response,
  fallbackMessage: string | null = null
) {
  let message;

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (_err) {
      body = {};
    }

    // Some APIs wrongly return `err` instead of `error`
    message = (body.error || body.err || {}).message;
  }

  if (message == null) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  return `${message} (${res.status})`;
}

const MAX_SERIALIZED_ERROR_DEPTH = 5;

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Convert a nested error property to a JSON-safe value. Errors and plain
 * objects/arrays are copied; circular references and class instances (for
 * example HTTP responses or path-scurry paths attached as an error `cause`)
 * are replaced with markers so `JSON.stringify()` can never throw.
 */
function toJsonSafe(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number
): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';
  if (depth >= MAX_SERIALIZED_ERROR_DEPTH) return '[Truncated]';

  if (value instanceof Error) {
    return serializeError(value, ancestors, depth + 1);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return `[${value.constructor?.name || 'Object'}]`;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => toJsonSafe(item, ancestors, depth + 1));
    }
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      copy[key] = toJsonSafe(child, ancestors, depth + 1);
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function serializeError(
  err: Partial<Error>,
  ancestors: WeakSet<object>,
  depth: number
): Record<string, unknown> {
  ancestors.add(err);
  try {
    const enumerable: Record<string, unknown> = { name: err.name };
    for (const key of Object.getOwnPropertyNames(err)) {
      enumerable[key] = toJsonSafe(
        (err as Record<string, unknown>)[key],
        ancestors,
        depth
      );
    }
    return enumerable;
  } finally {
    ancestors.delete(err);
  }
}

/**
 * Returns a new Object with enumberable properties that match
 * the provided `err` instance, for use with `JSON.stringify()`.
 *
 * Nested values are made JSON-safe: a `cause` error is serialized the same
 * way, and circular references or class instances are replaced with markers,
 * so writing the result (for example to `builds.json`) cannot throw and hide
 * the original error.
 */
export function toEnumerableError<E extends Partial<Error>>(err: E) {
  // Callers pass whatever was thrown, which may be a primitive
  // (`throw 'boom'`), `null`, or `undefined`. Preserve it as a message
  // instead of throwing and masking the original failure.
  if (err === null || typeof err !== 'object') {
    return { name: 'Error', message: String(err) } as {
      [K in keyof E]?: E[K];
    };
  }
  return serializeError(err, new WeakSet(), 0) as {
    [K in keyof E]?: E[K];
  };
}

export function printError(error: unknown, client?: Client) {
  // Coerce Strings to Error instances
  if (typeof error === 'string') {
    error = new Error(error);
  }
  recordCliError(cliErrorFromUnknown(error));

  const apiError = error as APIError;
  const { message, stack, status, code, sizeLimit } = apiError;

  const argumentError = isArgumentError(error) ? error : undefined;
  const suggestion =
    argumentError?.suggestedOption && argumentError.invalidOption;
  const correction =
    suggestion && client && argumentError
      ? buildCorrectedCommand(
          client.argv,
          argumentError.invalidOption!,
          argumentError.suggestedOption!,
          argumentError.flagsSpecification
        )
      : undefined;
  const recovery = getErrorRecovery(apiError, client);
  const reason =
    status === 403
      ? 'forbidden'
      : status === 402
        ? 'payment_required'
        : status === 401
          ? 'not_authorized'
          : status === 429
            ? 'rate_limited'
            : argumentError
              ? 'invalid_arguments'
              : 'api_error';
  const hint = argumentError?.allowedOptions
    ? `Vercel CLI ${pkg.version} accepts: ${argumentError.allowedOptions.join(', ')}.${suggestion ? ` Did you mean ${argumentError.suggestedOption}?` : ''}`
    : recovery.hint;
  if (client && (status || argumentError?.allowedOptions)) {
    const payload = {
      ...recovery,
      status: 'error' as const,
      reason,
      message: apiError.serverMessage || message,
      hint,
      ...(argumentError?.allowedOptions && {
        allowedOptions: argumentError.allowedOptions,
        suggestedOption: argumentError.suggestedOption,
        cliVersion: pkg.version,
      }),
      ...(correction && {
        next: [
          {
            command: correction,
            when: correction.includes('<')
              ? 'Replace placeholders with the intended values, then run the corrected command'
              : 'Run the corrected command',
          },
        ],
      }),
    };
    if (shouldEmitNonInteractiveCommandError(client)) {
      output.stopSpinner();
      writeAgentError(client, payload);
      return;
    }
    trackAgentError(client, payload);
  }

  if (hint) {
    output.stopSpinner();
    output.fatal(apiError.serverMessage || message || 'The request failed.');
    output.print(`  ${hint}\n`);
    if (correction) output.print(`  ${correction}\n`);
    return;
  }

  output.debug(`handling error: ${stack}`);

  if (message === 'User force closed the prompt with 0 null') {
    return;
  }

  if (status === 403) {
    output.error(
      message ||
        `Authentication error. Run ${getCommandName('login')} to log-in again.`
    );
  } else if (status === 429) {
    // Rate limited: display the message from the server-side,
    // which contains more details
    output.error(message);
  } else if (code === 'size_limit_exceeded') {
    output.error(`File size limit exceeded (${bytes(sizeLimit)})`);
  } else if (message) {
    output.prettyError(apiError);
  } else if (status === 500) {
    output.error('Unexpected server error. Please retry.');
  } else if (code === 'USER_ABORT') {
    output.log('Canceled');
  } else {
    output.error(`Unexpected error. Please try again later. (${message})`);
  }
}
