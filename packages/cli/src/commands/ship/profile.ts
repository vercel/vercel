import chalk from 'chalk';
import { outputJSON, readdir, remove } from 'fs-extra';
import { join } from 'node:path';
import output from '../../output-manager';

/**
 * Profiles are kept per run so two runs can be compared, and pruned so they do
 * not accumulate forever. Twenty is enough to cover a session of iterating on
 * something slow without turning into a directory nobody ever looks at.
 */
const MAX_PROFILES = 20;

/** Tool spans are named with this prefix so the summary can aggregate them. */
export const TOOL_SPAN_PREFIX = 'tool: ';

export interface ProfileSpan {
  name: string;
  /** Wall-clock start, so a profile can be lined up against other logs. */
  startedAt: string;
  /** Offset from the start of the run, which is what makes spans comparable. */
  offsetMs: number;
  durationMs: number;
  detail?: Record<string, unknown>;
  children: ProfileSpan[];
}

/**
 * Records where the wall time of a `vercel ship` run went.
 *
 * A session is mostly waiting: on an install, on a model, on a tool, on the
 * user. Which of those dominates is not guessable from watching a spinner, and
 * it changes with the harness, the project and the machine. Measuring is the
 * only way to know, and the numbers have to survive the run to be worth
 * anything, so they are written out as well as summarized.
 *
 * Durations come from a monotonic clock, so a clock adjustment mid-session
 * cannot produce a negative span.
 */
export class ShipProfile {
  private readonly root: ProfileSpan;
  /** Open spans, innermost last. Completed spans attach to the innermost. */
  private readonly open: ProfileSpan[];
  private readonly originMs = performance.now();

  /**
   * Wall-clock start of the run, for anything that has to compare against
   * `Date.now()`. The monotonic origin is the one durations are measured from.
   */
  readonly startedAtMs = Date.now();
  private readonly meta: Record<string, unknown> = {};

  constructor(name = 'vercel ship') {
    this.root = {
      name,
      startedAt: new Date().toISOString(),
      offsetMs: 0,
      durationMs: 0,
      children: [],
    };
    this.open = [this.root];
  }

  /** Attach a fact about the run, such as the harness or the runtime origin. */
  set(key: string, value: unknown): void {
    if (value !== undefined) {
      this.meta[key] = value;
    }
  }

  get totalMs(): number {
    return Math.round(performance.now() - this.originMs);
  }

  /**
   * Open a span. The returned function closes it and may add detail.
   *
   * Call sites close it in a `finally`, so a span survives the failure it is
   * most useful for measuring.
   */
  start(name: string, detail?: Record<string, unknown>): SpanEnd {
    const startedMs = performance.now();
    const span: ProfileSpan = {
      name,
      startedAt: new Date().toISOString(),
      offsetMs: Math.round(startedMs - this.originMs),
      durationMs: 0,
      ...(detail ? { detail } : {}),
      children: [],
    };

    this.parent().children.push(span);
    this.open.push(span);

    let closed = false;
    return (extra?: Record<string, unknown>) => {
      if (closed) return span.durationMs;
      closed = true;
      span.durationMs = Math.round(performance.now() - startedMs);
      if (extra) {
        span.detail = { ...span.detail, ...extra };
      }
      // Closing out of order would corrupt the tree for every later span, so
      // only remove this one and leave anything opened inside it in place.
      const index = this.open.lastIndexOf(span);
      if (index > 0) {
        this.open.splice(index, 1);
      }
      return span.durationMs;
    };
  }

  /**
   * Record a span that has already finished.
   *
   * Used for work that overlaps with its siblings, such as parallel tool calls,
   * which a stack of open spans cannot represent.
   */
  record(
    name: string,
    startedAtMs: number,
    durationMs: number,
    detail?: Record<string, unknown>
  ): void {
    this.parent().children.push({
      name,
      startedAt: new Date(
        Date.now() - (performance.now() - startedAtMs)
      ).toISOString(),
      offsetMs: Math.round(startedAtMs - this.originMs),
      durationMs: Math.round(durationMs),
      ...(detail ? { detail } : {}),
      children: [],
    });
  }

  /** Whether any span with this name was recorded at the top level. */
  has(name: string): boolean {
    return this.root.children.some(child => child.name === name);
  }

  private parent(): ProfileSpan {
    return this.open[this.open.length - 1];
  }

  /**
   * Give every still-open span the time it has run for so far.
   *
   * A run interrupted partway through leaves its spans open, and reporting
   * those as zero would say the session took no time at all, which is both
   * wrong and the opposite of what the profile is for. They are flagged as
   * unfinished so the numbers are not mistaken for completed work.
   */
  private seal(): void {
    const elapsed = this.totalMs;
    for (const span of this.open.slice(1)) {
      span.durationMs = elapsed - span.offsetMs;
      span.detail = { ...span.detail, unfinished: true };
    }
    this.open.length = 1;
  }

  /**
   * Write the full tree, and return the path it went to.
   *
   * Failures are reported but never thrown: a run that did the work must not be
   * reported as failed because its profile could not be saved.
   */
  async write(dir: string, filename: string): Promise<string | undefined> {
    this.seal();
    this.root.durationMs = this.totalMs;

    const path = join(dir, filename);
    try {
      await outputJSON(
        path,
        {
          ...this.meta,
          startedAt: this.root.startedAt,
          finishedAt: new Date().toISOString(),
          totalMs: this.root.durationMs,
          spans: this.root.children,
        },
        { spaces: 2 }
      );
    } catch (err) {
      output.debug(
        `ship: could not write the timing profile: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return undefined;
    }

    await prune(dir);
    return path;
  }

  /**
   * A short breakdown for the terminal.
   *
   * Every phase, with tool calls collapsed to one line per turn. That line is
   * the point of the summary: a turn that took 89s with 3s of it in tools was
   * waiting on the model, which is a different problem from one that spent it
   * running builds. The individual calls are in the written profile.
   */
  format(): string {
    this.seal();
    const total = this.root.durationMs || this.totalMs;
    const lines = [
      `${chalk.bold('Timing')}  total ${formatDuration(total)}`,
      ...this.root.children.flatMap(span => formatSpan(span, total, 1)),
    ];
    return lines.join('\n');
  }
}

export type SpanEnd = (extra?: Record<string, unknown>) => number;

function formatSpan(span: ProfileSpan, total: number, depth: number): string[] {
  const isTool = (child: ProfileSpan) =>
    child.name.startsWith(TOOL_SPAN_PREFIX);

  const lines = [formatRow(span.name, span.durationMs, total, depth)];

  for (const child of span.children.filter(child => !isTool(child))) {
    lines.push(...formatSpan(child, total, depth + 1));
  }

  const tools = span.children.filter(isTool);
  if (tools.length > 0) {
    // Tool calls can overlap, so this is time spent in tools rather than
    // elapsed time, and can exceed the span that contains them.
    const spent = tools.reduce((sum, tool) => sum + tool.durationMs, 0);
    const label = `tools (${tools.length} call${tools.length === 1 ? '' : 's'})`;
    lines.push(formatRow(label, spent, total, depth + 1));
  }

  return lines;
}

function formatRow(
  name: string,
  durationMs: number,
  total: number,
  depth: number
): string {
  const indent = '  '.repeat(depth);
  const share = total > 0 ? Math.round((durationMs / total) * 100) : 0;
  return (
    `  ${indent}${name.padEnd(Math.max(1, 30 - indent.length))}` +
    `${formatDuration(durationMs).padStart(8)}` +
    `${chalk.dim(`${String(share).padStart(4)}%`)}`
  );
}

/** `0.4s`, `12.0s`, `4m 12s`. */
export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
}

async function prune(dir: string): Promise<void> {
  try {
    const files = (await readdir(dir)).filter(name => name.endsWith('.json'));
    // Filenames lead with an ISO timestamp, so lexical order is time order.
    const stale = files
      .sort()
      .slice(0, Math.max(0, files.length - MAX_PROFILES));
    await Promise.all(stale.map(name => remove(join(dir, name))));
  } catch (err) {
    output.debug(
      `ship: could not prune old timing profiles: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
