import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import output from '../../output-manager';
import {
  type ActivityIndicator,
  formatElapsed,
  THINKING_PHRASES,
  WORKING_PHRASES,
} from './activity';
import { isTableRow, MarkdownStyler, renderTable } from './markdown';
import { TOOL_SPAN_PREFIX, type ShipProfile } from './profile';
import type { DeploymentTracker } from './deployments';
import {
  actionVerb,
  agentLabel,
  blankGutter,
  gutter,
  GUTTER_WIDTH,
  type Actor,
} from './voice';
import { textWidth, truncateAnsi, wrapAnsi } from './wrap';

/** Longest line of failure output echoed under a failed call. */
const MAX_ERROR_LINE_LENGTH = 100;

/**
 * Input fields worth showing, most specific first. A tool call is far more
 * useful as `read(vercel.json)` than as a bare `read`, and these cover the
 * filesystem, shell and search tools that dominate a session.
 */
const SUMMARY_FIELDS = [
  'command',
  'file_path',
  'filePath',
  'path',
  'pattern',
  'query',
  'url',
  'prompt',
  'description',
] as const;

/** Marks a line of reasoning, shown only when reasoning is not collapsed. */
const THINKING_GUTTER = chalk.dim('│ ');

/** Below this, a reasoning block is not worth a line reporting it happened. */
const REPORTABLE_THINKING_MS = 2000;

/** Below this, a completed tool is not worth a line of its own. */
const SLOW_TOOL_MS = 3000;

/** Tail lines shown when a tool fails. */
const ERROR_TAIL_LINES = 6;

/**
 * Renders harness stream events as live progress.
 *
 * Three concerns drive the design:
 *
 * 1. A session spends most of its time in tool calls, so tool activity is shown
 *    rather than hidden behind `--debug`; without it the CLI looks hung.
 * 2. Agent prose is markdown, so it is styled a line at a time — see
 *    `MarkdownStyler` for why line-at-a-time rather than a real parser.
 * 3. Reasoning and answer are visually separated, because a wall of undelimited
 *    thinking is indistinguishable from conclusions the user is meant to act on.
 *
 * Everything goes to stderr, leaving stdout free for machine-readable output.
 */
export class StreamRenderer {
  private readonly markdown = new MarkdownStyler();
  private readonly activity: ActivityIndicator | undefined;

  /** When the current thinking block began, for the closing summary. */
  private thinkingStartedAt = 0;
  /** Consecutive table rows held until the block ends and widths are known. */
  private tableRows: string[] = [];
  /** Tool calls issued but not yet resolved, keyed by call id. */
  private readonly inFlight = new Map<
    string,
    {
      label: string;
      summary: string;
      startedAt: number;
      command?: string;
    }
  >();

  /**
   * The run of tool calls currently open, and when the first of them started.
   *
   * Parallel calls settle one after another, and a duration printed for each
   * says only that something was slow, not which thing. Their individual
   * durations overlap anyway; what the wall time of the batch measures is the
   * thing the user waited for. Per-call timings stay in the written profile.
   */
  private groupStartedAt = 0;
  private groupCount = 0;

  private readonly profile: ShipProfile | undefined;

  /** Watches tool output for deployments the session creates. */
  private deployments: DeploymentTracker | undefined;

  /** Label for the harness driving the session, shown against its output. */
  private agent = 'agent';

  /**
   * Print reasoning in full rather than collapsing it to a duration.
   *
   * Off by default. Reasoning was a quarter of everything printed in a measured
   * session, in blocks of up to fifty lines, and it is process rather than
   * result: the harness keeps its own transcript for anyone who wants it.
   */
  private verbose = false;

  /** Whether the current run of agent prose has had its label printed. */
  private labelled = false;

  /** Tool calls settled during the current turn. */
  private turnToolCalls = 0;

  constructor(activity?: ActivityIndicator, profile?: ShipProfile) {
    this.activity = activity;
    this.profile = profile;
  }

  get toolCallCount(): number {
    return this.turnToolCalls;
  }

  /**
   * Watch for deployments in tool output.
   *
   * Here rather than in the caller because the renderer is the only thing that
   * sees a tool's command and its result together.
   */
  trackDeployments(tracker: DeploymentTracker): void {
    this.deployments = tracker;
  }

  /** Name the harness whose output this is, and set the verbosity. */
  attribute(harnessId: string, options: { verbose?: boolean } = {}): void {
    this.agent = agentLabel(harnessId);
    this.verbose = options.verbose ?? false;
  }

  /**
   * Reset per-turn counters.
   *
   * At the start of a turn rather than the end, so a caller closing out a turn
   * can still read what happened during it.
   */
  beginTurn(): void {
    this.turnToolCalls = 0;
  }

  /** Text received but not yet terminated by a newline. */
  private textBuffer = '';
  /** Reasoning received but not yet terminated by a newline. */
  private thinkingBuffer = '';
  /** Whether a thinking block is currently open. */
  private thinking = false;
  /** True once anything has been written, so callers can clear a spinner. */
  private started = false;

  get hasOutput(): boolean {
    return this.started;
  }

  render(part: { type: string; [key: string]: unknown }): void {
    switch (part.type) {
      case 'text-delta':
        this.closeThinking();
        this.textBuffer = this.drainText(this.textBuffer + asString(part.text));
        break;

      case 'reasoning-delta':
        // Swap the phrasing while the model reasons, so the animated line
        // reflects what is actually happening.
        this.activity?.setActivity(THINKING_PHRASES);
        this.openThinking();
        if (this.verbose) {
          this.thinkingBuffer = this.drain(
            this.thinkingBuffer + asString(part.text),
            line => this.thinkingLine(line)
          );
        }
        break;

      case 'reasoning-end':
        this.closeThinking();
        break;

      case 'tool-call':
        this.flush();
        this.writeToolCall(part);
        break;

      case 'tool-result':
        // The AI SDK marks incremental tool output with `preliminary`. The
        // claude-code adapter does not emit it today, so long commands report
        // only on completion; handling it here means live command output starts
        // showing the moment an adapter does, instead of being mistaken for the
        // call finishing.
        if (part.preliminary === true) {
          this.showToolProgress(part);
        } else {
          this.settleTool(part, false);
        }
        break;

      case 'tool-error':
        this.flush();
        this.settleTool(part, true);
        break;

      case 'abort':
        this.flush();
        this.say('vercel', 'vercel', chalk.yellow('Session aborted.'));
        break;

      case 'error':
        this.flush();
        output.error(errorMessage(part.error));
        this.started = true;
        break;

      default:
        output.debug(`harness stream part: ${part.type}`);
    }
  }

  /**
   * Emit any partial line and close an open thinking block. Call before handing
   * the terminal to something else, such as a prompt.
   */
  flush(): void {
    if (this.textBuffer) {
      this.styleTextLine(this.textBuffer);
      this.textBuffer = '';
    }
    this.flushTable();
    this.closeThinking();
  }

  /** Reset per-turn state so a multi-turn session starts each turn clean. */
  endTurn(): void {
    this.flush();
    this.markdown.reset();
  }

  /**
   * Emit every complete line in `buffer`, returning the unterminated remainder.
   * Holding the remainder is what lets markdown be styled per line while still
   * streaming.
   */
  private drain(buffer: string, style: (line: string) => string): string {
    const segments = buffer.split('\n');
    const remainder = segments.pop() ?? '';
    for (const line of segments) {
      this.writeLine(style(line));
    }
    return remainder;
  }

  /** As `drain`, but routes table rows into the pending-table buffer. */
  private drainText(buffer: string): string {
    const segments = buffer.split('\n');
    const remainder = segments.pop() ?? '';
    for (const line of segments) {
      this.styleTextLine(line);
    }
    return remainder;
  }

  private styleTextLine(line: string): void {
    if (isTableRow(line)) {
      this.tableRows.push(line);
      return;
    }
    this.flushTable();

    const styled = this.markdown.line(line);

    // Code keeps the shape it was written in. Wrapping it would reflow the
    // indentation that carries its meaning. The label is left to `say`, so a
    // block is labelled once at its first line rather than on every line.
    if (this.markdown.preformatted) {
      if (stripAnsi(styled).trim() === '') {
        this.writeLine('');
        return;
      }
      this.say('agent', this.agent, styled, { wrap: false });
      return;
    }

    if (styled.trim() === '') {
      // A blank line separates paragraphs; the next one is labelled again so a
      // reader can tell a new thought from a continued one.
      this.labelled = false;
      this.writeLine('');
      return;
    }

    this.say('agent', this.agent, styled, {
      hangingIndent: this.markdown.hangingIndent,
    });
  }

  /**
   * Write an attributed line, wrapped, with the label shown once per block.
   *
   * Repeating the label on every line of a paragraph turns the column into
   * noise; showing it once and holding the text column steady is what makes the
   * transcript readable down one edge.
   */
  private say(
    actor: Actor,
    label: string,
    text: string,
    options: { wrap?: boolean; hangingIndent?: string } = {}
  ): void {
    const width = textWidth(GUTTER_WIDTH);
    const lines =
      options.wrap === false
        ? [truncateAnsi(text, width)]
        : wrapAnsi(text, width, options.hangingIndent ?? '');

    const continued = actor === 'agent' && this.labelled;

    this.writeLine(
      (continued ? blankGutter() : gutter(actor, label)) + lines[0]
    );
    for (const line of lines.slice(1)) {
      this.writeLine(blankGutter() + line);
    }

    this.labelled = actor === 'agent';
  }

  /** Render and emit any accumulated table. */
  private flushTable(): void {
    if (this.tableRows.length === 0) return;
    const rows = this.tableRows;
    this.tableRows = [];
    // Indented to the text column like everything else the agent produced. A
    // table starting at column zero reads as output from something else.
    for (const line of renderTable(rows, textWidth(GUTTER_WIDTH))) {
      this.writeLine(blankGutter() + line);
    }
    this.labelled = false;
  }

  private openThinking(): void {
    if (this.thinking) return;
    if (this.textBuffer) {
      this.styleTextLine(this.textBuffer);
      this.textBuffer = '';
    }
    this.flushTable();
    this.thinkingStartedAt = Date.now();
    this.thinking = true;

    // Only announced up front when the text is coming. Collapsed, the block is
    // one line reporting a duration, which cannot be written until that
    // duration is known, and the status line already says it is thinking.
    if (this.verbose) {
      this.say('agent', this.agent, chalk.dim('thinking'));
    }
  }

  private closeThinking(): void {
    if (!this.thinking) return;
    if (this.thinkingBuffer) {
      this.writeLine(blankGutter() + this.thinkingLine(this.thinkingBuffer));
      this.thinkingBuffer = '';
    }

    // Reasoning that just stops reads as interrupted; a duration reads as
    // finished. Under a couple of seconds it is not worth a line at all.
    const elapsed = Date.now() - this.thinkingStartedAt;
    if (elapsed >= REPORTABLE_THINKING_MS) {
      this.labelled = false;
      this.say(
        'agent',
        this.agent,
        chalk.dim(`thought for ${formatElapsed(Math.round(elapsed / 1000))}`)
      );
    }

    this.labelled = false;
    this.thinking = false;
    this.activity?.setActivity(WORKING_PHRASES);
  }

  /**
   * Reasoning is dimmed wholesale rather than markdown-styled: bold and dim
   * share ANSI reset 22, so any nested emphasis would silently cancel the dim
   * for the rest of the line.
   */
  private thinkingLine(line: string): string {
    return line ? THINKING_GUTTER + chalk.dim(line) : '';
  }

  /**
   * Clear the animated line, write, then let it come back. `output.spinner()`
   * only draws after a delay, so consecutive writes never redraw it while an
   * idle gap does — no flicker, and no silent stretches.
   */
  private writeLine(line: string): void {
    this.activity?.pause();
    output.print(`${line}\n`);
    this.started = true;
    this.activity?.resume();
  }

  private writeToolCall(part: { [key: string]: unknown }): void {
    const name = asString(part.toolName) || 'tool';
    const summary = summarizeToolInput(part.input ?? part.args);
    const verb = actionVerb(name);
    const label = summary ? `${verb} ${summary}` : verb;

    // An action is what happened to the user's machine, so it is labelled with
    // the verb and the thing it acted on, not with the tool that implemented it.
    // Never wrapped: the shape of a command is what is being scanned for, and a
    // command folded over three lines is harder to read than a cut one.
    this.labelled = false;
    this.say('action', verb, summary || chalk.dim(name), { wrap: false });

    const id = asString(part.toolCallId);
    if (id) {
      // A duration reported on its own is only unambiguous when one call was
      // running. Overlap is marked on both the existing calls and the new one,
      // so each can name itself when it finishes.
      if (this.inFlight.size === 0 && this.groupCount === 0) {
        this.groupStartedAt = performance.now();
      }
      this.groupCount += 1;

      // Monotonic, so a clock adjustment mid-call cannot report a negative
      // duration to the user or into the profile.
      this.inFlight.set(id, {
        label,
        summary,
        startedAt: performance.now(),
        command: shellCommand(part.input),
      });
    }

    // The harness streams no incremental tool output, so a slow command would
    // otherwise sit behind a generic "working" line. Naming the running command
    // is the difference between "is this stuck?" and "the build is still going".
    this.activity?.setActivity([label]);
  }

  /**
   * Account for a run of calls that took long enough to be worth accounting for.
   *
   * One line once they have all settled, measuring the wall time the user
   * actually waited, rather than one line per call. A column of durations
   * following four parallel calls cannot be matched to the calls that produced
   * them, and overlapping durations do not add up to anything meaningful.
   */
  private reportGroupDuration(): void {
    const elapsed = performance.now() - this.groupStartedAt;
    const count = this.groupCount;
    this.groupCount = 0;
    this.groupStartedAt = 0;

    if (elapsed < SLOW_TOOL_MS || count === 0) {
      return;
    }

    const duration = formatElapsed(Math.round(elapsed / 1000));
    const text = count === 1 ? duration : `${duration} for ${count} calls`;

    this.labelled = false;
    this.say('action', 'took', chalk.dim(text), { wrap: false });
  }

  /**
   * Surface partial output from a still-running tool on the activity line, so a
   * long command reports progress without flooding the transcript.
   */
  private showToolProgress(part: { [key: string]: unknown }): void {
    const id = asString(part.toolCallId);
    const tracked = id ? this.inFlight.get(id) : undefined;
    const [latest] = tailLines(part.output).slice(-1);
    if (!latest) return;

    this.activity?.setPhrases([
      tracked ? `${tracked.label} → ${latest}` : latest,
    ]);
  }

  /**
   * Close out a tool call.
   *
   * Fast calls print nothing — the call line already said what happened, and one
   * status line per call would drown the transcript. Slow and failed calls do
   * print, because those are the ones a user wants accounted for.
   */
  private settleTool(part: { [key: string]: unknown }, failed: boolean): void {
    const id = asString(part.toolCallId);
    const tracked = id ? this.inFlight.get(id) : undefined;
    if (id) this.inFlight.delete(id);

    const groupFinished = this.inFlight.size === 0;
    if (groupFinished) {
      this.activity?.setActivity(WORKING_PHRASES);
    }

    const name = asString(part.toolName) || tracked?.label || 'tool';
    const elapsed = tracked ? performance.now() - tracked.startedAt : 0;

    if (!failed && tracked?.command) {
      this.deployments?.observe(tracked.command, toText(part.output));
    }

    this.turnToolCalls += 1;
    if (tracked) {
      // Recorded rather than opened and closed as a span: tool calls run in
      // parallel, which a stack of open spans cannot represent.
      this.profile?.record(
        `${TOOL_SPAN_PREFIX}${name}`,
        tracked.startedAt,
        elapsed,
        failed ? { failed: true } : undefined
      );
    }

    if (failed) {
      this.labelled = false;
      this.say('action', 'failed', chalk.yellow(tracked?.label ?? name));
      for (const line of tailLines(part.error ?? part.output)) {
        this.writeLine(blankGutter() + chalk.dim(line));
      }
    }

    if (groupFinished) {
      this.reportGroupDuration();
    }
  }
}

function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';

  const record = input as Record<string, unknown>;
  for (const field of SUMMARY_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\s+/g, ' ');
    }
  }
  return '';
}

/**
 * The full shell command a tool call is running, if it is one.
 *
 * Unlike the display summary this is neither truncated nor collapsed, because
 * it is matched against rather than shown.
 */
function shellCommand(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' && command.trim() ? command : undefined;
}

function truncate(value: string): string {
  return value.length > MAX_ERROR_LINE_LENGTH
    ? `${value.slice(0, MAX_ERROR_LINE_LENGTH - 1)}…`
    : value;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown harness error';
}

/**
 * Extract the last few lines of a tool failure.
 *
 * Tool outputs arrive in several shapes depending on the adapter — a plain
 * string, `{ stdout, stderr }`, or a content-part array — so this reduces
 * whatever it is to text rather than assuming one of them.
 */
function tailLines(value: unknown): string[] {
  const text = toText(value).trim();
  if (!text) return [];
  const lines = text.split('\n').filter(line => line.trim() !== '');
  return lines.slice(-ERROR_TAIL_LINES).map(line => truncate(line.trim()));
}

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of [
      'text',
      'message',
      'stderr',
      'stdout',
      'output',
      'content',
    ]) {
      if (key in record) {
        const nested = toText(record[key]);
        if (nested) return nested;
      }
    }
    return '';
  }

  return String(value);
}
