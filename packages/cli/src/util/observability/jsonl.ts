import stripAnsi from 'strip-ansi';
import type Client from '../client';
import { getExitCodeForReason } from '../agent-output-constants';
import type { AgentErrorPayload } from '../agent-output';
import { agentErrorMetadata, trackAgentError } from '../telemetry/agent-error';
import { recordCliError } from '../telemetry/cli-error';
import type { ExcludedInterval } from './events';

/**
 * The JSON Lines contract shared by `vercel logs --json` and
 * `vercel traces search --json`: one object per line, each with a CLI-owned
 * `type`. Record lines carry the unchanged API event under `data`, and every
 * successful invocation ends with one `summary` line. A failure writes one
 * compact JSON error document on stderr instead of a summary.
 */

export interface Pagination {
  /** More records matched than were returned. */
  readonly hasMore: boolean;
  /** A `--next` token when one is available, otherwise `null`. */
  readonly next: string | null;
}

export interface ResultProgress {
  readonly recordsReturned: number;
  readonly timeRange: { readonly start: string; readonly end: string };
  readonly pagination: Pagination;
  readonly excludedIntervals: ReadonlyArray<ExcludedInterval>;
}

export function recordLine<T extends string>(type: T, data: unknown): string {
  return `${JSON.stringify({ type, data })}\n`;
}

export function summaryLine(progress: ResultProgress): string {
  return `${JSON.stringify({ type: 'summary', ...progress })}\n`;
}

export type JsonErrorPayload = Omit<AgentErrorPayload, 'next'> & {
  next?: Array<{ command: string; when?: string }>;
  data?: Record<string, unknown>;
};

/**
 * Writes one compact JSON error document to stderr and returns the exit
 * code. Records already written to stdout stay there. Never exits the
 * process, so telemetry still flushes.
 */
export function writeJsonError(
  client: Client,
  payload: JsonErrorPayload,
  exitCode: number = getExitCodeForReason(payload.reason)
): number {
  const { status, reason, message, ...rest } = payload;
  const document: JsonErrorPayload = {
    status,
    reason,
    message: stripAnsi(message),
    ...rest,
    ...(rest.hint ? { hint: stripAnsi(rest.hint) } : {}),
    ...agentErrorMetadata(client),
  };
  // The message can hold resource names, so only the reason is recorded.
  recordCliError({ code: payload.reason, reportOnSuccess: true });
  trackAgentError(client, document);
  client.stderr.write(`${JSON.stringify(document)}\n`);
  return exitCode;
}
