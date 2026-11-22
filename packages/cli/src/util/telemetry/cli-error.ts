import { Diagnostic } from 'nostics';

/** The error fields sent with a failed agent run. */
export interface CliErrorDetails {
  code?: string;
  status?: number;
  slug?: string;
  action?: string;
  serverMessage?: string;
  /**
   * Send this error even when the command exits `0`, for failures a command
   * passes through without failing itself (e.g. a 404 from `vc api`).
   */
  reportOnSuccess?: boolean;
}

/** Sent for a failed run when the command reported no error code. */
export const UNCLASSIFIED_ERROR_CODE = 'UNCLASSIFIED_ERROR';

// Large stdout writes are command output (e.g. `vc api` responses), not agent error payloads
const MAX_SCANNED_OUTPUT_LENGTH = 64 * 1024;

let recorded: CliErrorDetails | undefined;

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value === 'object' && value !== null && key in value) {
    const property = (value as Record<string, unknown>)[key];
    if (typeof property === 'string') return property;
  }
  return undefined;
}

function numberProperty(value: unknown, key: string): number | undefined {
  if (typeof value === 'object' && value !== null && key in value) {
    const property = (value as Record<string, unknown>)[key];
    if (typeof property === 'number') return property;
  }
  return undefined;
}

/**
 * Reads the error fields off anything a command threw or printed. Messages
 * can hold user input (e.g. a malformed `--field` value), so they are left out
 * unless `includeMessage` is set.
 */
export function cliErrorFromUnknown(
  err: unknown,
  { includeMessage = false }: { includeMessage?: boolean } = {}
): CliErrorDetails {
  // `Diagnostic` errors carry their stable code on `name`, other errors use a `code` field
  const code =
    err instanceof Diagnostic && err.name !== 'Diagnostic'
      ? err.name
      : stringProperty(err, 'code');
  return {
    status: numberProperty(err, 'status'),
    // An error with no code is usually a crash, and its class (e.g. `TypeError`) is still useful
    code:
      code ??
      (err instanceof Error && err.name !== 'Error' && err.name !== 'Diagnostic'
        ? err.name
        : undefined),
    slug: stringProperty(err, 'slug'),
    action: stringProperty(err, 'action'),
    serverMessage: includeMessage
      ? (stringProperty(err, 'serverMessage') ?? stringProperty(err, 'message'))
      : undefined,
  };
}

/**
 * Remembers an error a command reported, so a failing run can send it once
 * when the CLI exits. Commands usually print an error and return a non-zero
 * exit code instead of throwing, so the shared error printers call this.
 * The first error with a code wins unless `override` is set.
 */
export function recordCliError(
  details: CliErrorDetails,
  { override = false }: { override?: boolean } = {}
): void {
  if (recorded && !override && (recorded.code || !details.code)) return;
  recorded = details;
}

/**
 * Records the `reason` of an agent JSON payload (`status: "error"` or
 * `"action_required"`) written to stdout. Many commands write these payloads
 * directly instead of through `outputAgentError()`.
 */
export function recordCliErrorFromOutput(chunk: unknown): void {
  if (
    typeof chunk !== 'string' ||
    chunk.length > MAX_SCANNED_OUTPUT_LENGTH ||
    !chunk.includes('"reason"')
  ) {
    return;
  }
  const text = chunk.trim();
  if (!text.startsWith('{')) return;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return;
  }
  const status = stringProperty(payload, 'status');
  const reason = stringProperty(payload, 'reason');
  // Only counts when the run fails: regular output can look like this payload
  if ((status === 'error' || status === 'action_required') && reason) {
    recordCliError({ code: reason });
  }
}

/** Reads the recorded error without consuming the agent run's copy. */
export function peekCliError(): CliErrorDetails | undefined {
  return recorded;
}

/** Returns the recorded error and clears it. */
export function takeCliError(): CliErrorDetails | undefined {
  const details = recorded;
  recorded = undefined;
  return details;
}
