import type { TraceEvent } from '@vercel/build-utils';
import CiInfo from 'ci-info';
import { peekCliError, UNCLASSIFIED_ERROR_CODE } from './cli-error';

// The bridge drops the whole span when any tag fails this check.
const BRIDGE_TAG = /^[a-zA-Z0-9_.:-]{1,80}$/;

// The bridge's `error_code` rule; a code it would reject drops the whole span.
const ERROR_CODE = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;

interface CommandTraceContext {
  command: string;
  invocationId: string;
  cliVersion: string;
  releaseChannel: string;
  isAgent: boolean;
  agentName?: string;
  exitCode: number;
  completion: 'completed' | 'process_exit';
  startupDurationMs?: number;
  /** Set when the CLI's top-level handler caught the command's error. */
  errorSource?: 'caught';
}

/**
 * Time from `vc.js` entry in this process to now, minus `excludedMs` (time spent
 * waiting on the user). Node bootstrap before the entry, and the Node launcher
 * that spawns a native binary, are not included.
 */
export function getStartupDurationMs(excludedMs = 0): number | undefined {
  const entryAt = Reflect.get(globalThis, Symbol.for('vercel.cli.entry-at'));
  return typeof entryAt === 'number'
    ? Math.max(0, performance.now() - entryAt - excludedMs)
    : undefined;
}

function getOutcome({ exitCode, completion }: CommandTraceContext) {
  if (exitCode === 130) return 'canceled';
  if (exitCode !== 0) return 'failure';
  // `process.exit(0)` mid-command does not tell us whether the command succeeded.
  return completion === 'process_exit' ? 'unknown' : 'success';
}

/**
 * Builds the telemetry copy of the local `vc.cli.command` span. Only its timing
 * is reused; the local tags stay out, since `vc build` uploads them in
 * `.vercel/output/diagnostics`.
 */
export function toCommandTrace(
  event: TraceEvent,
  context: CommandTraceContext
): TraceEvent {
  const tags: Record<string, string> = {
    command: context.command,
    invocation_id: context.invocationId,
    cli_version: context.cliVersion,
    release_channel: context.releaseChannel,
    platform: process.platform,
    arch: process.arch,
    is_agent: String(context.isAgent),
    exit_code: String(context.exitCode),
    completion: context.completion,
    outcome: getOutcome(context),
  };
  if (tags.outcome === 'failure') {
    const details = peekCliError();
    tags.error_code =
      details?.code && ERROR_CODE.test(details.code)
        ? details.code
        : UNCLASSIFIED_ERROR_CODE;
    tags.error_source =
      context.errorSource ?? (details ? 'recorded' : 'unknown');
  }
  // `AI_AGENT` can hold any custom name.
  if (context.agentName && BRIDGE_TAG.test(context.agentName)) {
    tags.agent_name = context.agentName;
  }
  if (CiInfo.id) {
    tags.ci = CiInfo.id;
  }
  if (context.startupDurationMs !== undefined) {
    tags.startup_duration_ms = context.startupDurationMs.toFixed(3);
  }
  return {
    id: event.id,
    name: event.name,
    timestamp: event.timestamp,
    startTime: event.startTime,
    duration: event.duration,
    tags,
  };
}
