import chalk from 'chalk';
import { Writable } from 'stream';
import {
  TUI,
  ProcessTerminal,
  Text,
  Spacer,
  matchesKey,
  visibleWidth,
} from '@mariozechner/pi-tui';
import type { Component } from '@mariozechner/pi-tui';

import type Client from '../../util/client';
import type { DevTelemetryClient } from '../../util/telemetry/commands/dev';
import { startDevServer, type DevContext, type DevOptions } from './dev-server';
import output from '../../output-manager';

// ---------------------------------------------------------------------------
// ANSI / line helpers
// ---------------------------------------------------------------------------
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const SERVICE_PREFIX_RE = /^\[([^\]]+)\]/;
const ERROR_LINE_RE = /^\[([^\]]+)\]\s+ERROR:/;
const HTTP_ERROR_RE =
  /^\[([^\]]+)\].*"[A-Z]+\s+\S+\s+HTTP\/[\d.]+"\s+([45]\d{2})\b/;
const MAX_EVENT_TEXT_LENGTH = 200;
const MAX_TOOL_PREVIEW_LENGTH = 60;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

function truncateText(text: string, maxLength = MAX_EVENT_TEXT_LENGTH): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function truncateInlineValue(
  value: string,
  maxLength = MAX_TOOL_PREVIEW_LENGTH
) {
  return truncateText(value.replace(/\s+/g, ' '), maxLength);
}

function quoteToolValue(value: string): string {
  return JSON.stringify(truncateInlineValue(value));
}

function formatReadArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const candidate = args as {
    path?: unknown;
    offset?: unknown;
    limit?: unknown;
  };

  if (typeof candidate.path !== 'string') return null;

  const segments = [candidate.path];
  if (
    typeof candidate.offset === 'number' &&
    Number.isInteger(candidate.offset) &&
    typeof candidate.limit === 'number' &&
    Number.isInteger(candidate.limit) &&
    candidate.limit > 0
  ) {
    segments.push(
      `lines ${candidate.offset + 1}-${candidate.offset + candidate.limit}`
    );
  } else if (
    typeof candidate.offset === 'number' &&
    Number.isInteger(candidate.offset)
  ) {
    segments.push(`offset ${candidate.offset}`);
  }

  return truncateText(segments.join(' '));
}

function formatEditArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const candidate = args as {
    path?: unknown;
    oldText?: unknown;
    newText?: unknown;
  };

  if (typeof candidate.path !== 'string') return null;

  if (
    typeof candidate.oldText === 'string' &&
    typeof candidate.newText === 'string'
  ) {
    return truncateText(
      `${candidate.path} replace ${quoteToolValue(candidate.oldText)} -> ${quoteToolValue(candidate.newText)}`
    );
  }

  return truncateText(candidate.path);
}

function formatToolArgs(toolName: string, args: unknown): string {
  if (toolName === 'read') {
    const readArgs = formatReadArgs(args);
    if (readArgs) return readArgs;
  }

  if (toolName === 'edit') {
    const editArgs = formatEditArgs(args);
    if (editArgs) return editArgs;
  }

  try {
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      const entries = Object.entries(args as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key}=${quoteToolValue(value)}`;
          }
          try {
            return `${key}=${truncateInlineValue(JSON.stringify(value) ?? String(value))}`;
          } catch {
            return `${key}=${truncateInlineValue(String(value))}`;
          }
        });
      if (entries.length > 0) {
        return truncateText(entries.join(' '));
      }
    }

    const serialized = JSON.stringify(args);
    return truncateText(serialized ?? String(args));
  } catch {
    return truncateText(String(args));
  }
}

function formatToolStartLine(toolName: string, args: unknown): string {
  return chalk.dim(`\n[${toolName}] ${formatToolArgs(toolName, args)}\n`);
}

function formatToolDoneLine(toolName: string): string {
  return chalk.green(`[${toolName}] done\n`);
}

export const _internal = {
  formatReadArgs,
  formatEditArgs,
  formatToolArgs,
};

function formatToolError(details: unknown): string {
  if (details instanceof Error) {
    return truncateText(details.message);
  }

  if (typeof details === 'string') {
    return truncateText(details);
  }

  if (details && typeof details === 'object') {
    const candidate = details as {
      error?: unknown;
      message?: unknown;
      result?: unknown;
    };

    if (typeof candidate.message === 'string') {
      return truncateText(candidate.message);
    }

    if (candidate.error instanceof Error) {
      return truncateText(candidate.error.message);
    }

    if (typeof candidate.error === 'string') {
      return truncateText(candidate.error);
    }

    if (typeof candidate.result === 'string') {
      return truncateText(candidate.result);
    }

    try {
      return truncateText(JSON.stringify(details) ?? String(details));
    } catch {
      return truncateText(String(details));
    }
  }

  return truncateText(String(details));
}

/** Return first and last non-empty lines of `text` (ANSI-stripped). */
function errorSignature(text: string): string {
  const lines = text
    .split('\n')
    .map(l => stripAnsi(l).trim())
    .filter(Boolean);
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];
  return `${lines[0]}\n${lines[lines.length - 1]}`;
}

// ---------------------------------------------------------------------------
// ErrorChunker — collects multi-line error blocks from streaming output
// ---------------------------------------------------------------------------
type ErrorChunkCallback = (text: string) => void;

class ErrorChunker {
  private lineBuffer = '';
  private collecting: {
    serviceName: string;
    lines: string[];
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private onChunk: ErrorChunkCallback) {}

  feed(text: string) {
    this.lineBuffer += text;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      this.processLine(line + '\n');
    }
  }

  dispose() {
    this.flush();
  }

  private processLine(line: string) {
    const stripped = stripAnsi(line);
    const errorMatch =
      stripped.match(ERROR_LINE_RE) || stripped.match(HTTP_ERROR_RE);

    if (errorMatch) {
      this.flush();
      this.collecting = {
        serviceName: errorMatch[1],
        lines: [line],
        timer: setTimeout(() => this.flush(), 500),
      };
      return;
    }

    if (this.collecting) {
      const serviceMatch = stripped.match(SERVICE_PREFIX_RE);
      if (serviceMatch && serviceMatch[1] !== this.collecting.serviceName) {
        this.flush();
      } else {
        this.collecting.lines.push(line);
      }
    }
  }

  private flush() {
    if (!this.collecting) return;
    clearTimeout(this.collecting.timer);
    const text = this.collecting.lines.join('');
    this.collecting = null;
    this.onChunk(text);
  }
}

// ---------------------------------------------------------------------------
// ErrorStore — groups errors by signature, keeps full text for the agent
// ---------------------------------------------------------------------------
const MAX_ERROR_GROUPS = 5;

interface ErrorGroup {
  /** Hash key — first + last non-empty lines */
  signature: string;
  /** Display label — first non-empty line, truncated */
  label: string;
  /** Full log text of the most recent occurrence (fed to the agent) */
  latestFullText: string;
  /** How many times this signature has been seen */
  count: number;
}

class ErrorStore {
  /** Ordered from oldest to newest */
  private groups: ErrorGroup[] = [];
  private onChange?: () => void;

  constructor(onChange?: () => void) {
    this.onChange = onChange;
  }

  push(fullText: string) {
    const sig = errorSignature(fullText);
    if (!sig) return;

    const existing = this.groups.find(g => g.signature === sig);
    if (existing) {
      existing.count++;
      existing.latestFullText = fullText;
      // Move to end (most recent)
      this.groups = this.groups.filter(g => g !== existing);
      this.groups.push(existing);
    } else {
      const firstLine = sig.split('\n')[0];
      this.groups.push({
        signature: sig,
        label: firstLine,
        latestFullText: fullText,
        count: 1,
      });
    }

    // Cap at MAX_ERROR_GROUPS — drop oldest
    while (this.groups.length > MAX_ERROR_GROUPS) {
      this.groups.shift();
    }

    this.onChange?.();
  }

  /** Remove groups by signature. */
  remove(signatures: Set<string>) {
    this.groups = this.groups.filter(g => !signatures.has(g.signature));
    this.onChange?.();
  }

  getGroups(): readonly ErrorGroup[] {
    return this.groups;
  }

  get size(): number {
    return this.groups.length;
  }
}

// ---------------------------------------------------------------------------
// ErrorMenu — custom pi-tui Component: navigable checkbox list of errors
// ---------------------------------------------------------------------------
class ErrorMenu implements Component {
  private cursor = 0;
  /** Set of selected signatures */
  private selected = new Set<string>();
  /** Callback when user presses Enter on LFG */
  onSubmit?: (selectedGroups: ErrorGroup[]) => void;

  constructor(private errorStore: ErrorStore) {}

  invalidate() {}

  handleInput(data: string) {
    const groups = this.errorStore.getGroups();
    // Total items = error groups + 1 for LFG button
    const totalItems = groups.length + 1;
    if (totalItems === 0) return;

    if (matchesKey(data, 'up') || matchesKey(data, 'k')) {
      this.cursor = Math.max(0, this.cursor - 1);
    } else if (matchesKey(data, 'down') || matchesKey(data, 'j')) {
      this.cursor = Math.min(totalItems - 1, this.cursor + 1);
    } else if (data === ' ') {
      // Space toggles selection — only on error rows, not LFG
      if (this.cursor < groups.length) {
        const sig = groups[this.cursor].signature;
        if (this.selected.has(sig)) {
          this.selected.delete(sig);
        } else {
          this.selected.add(sig);
        }
      }
    } else if (matchesKey(data, 'enter')) {
      // Enter on LFG button
      if (this.cursor === groups.length && this.selected.size > 0) {
        const chosen = groups.filter(g => this.selected.has(g.signature));
        this.onSubmit?.(chosen);
      }
    } else if (matchesKey(data, 'a')) {
      // Select all / deselect all
      if (this.selected.size === groups.length) {
        this.selected.clear();
      } else {
        for (const g of groups) {
          this.selected.add(g.signature);
        }
      }
    }
  }

  /** Call after errors are removed to clean up stale selections and clamp cursor. */
  sync() {
    const groups = this.errorStore.getGroups();
    const validSigs = new Set(groups.map(g => g.signature));
    for (const sig of this.selected) {
      if (!validSigs.has(sig)) this.selected.delete(sig);
    }
    const totalItems = groups.length + 1;
    if (this.cursor >= totalItems) {
      this.cursor = Math.max(0, totalItems - 1);
    }
  }

  render(width: number): string[] {
    const groups = this.errorStore.getGroups();
    if (groups.length === 0) return [];

    const lines: string[] = [];

    // Title
    lines.push(chalk.red.bold('  ● Do you want me to fix the errors for you?'));
    lines.push('');

    // Error rows
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const isCursor = i === this.cursor;
      const isChecked = this.selected.has(g.signature);
      const checkbox = isChecked ? chalk.red('[x]') : chalk.red('[ ]');
      const pointer = isCursor ? chalk.red('❯ ') : '  ';
      const countStr = g.count > 1 ? chalk.red.dim(` (x${g.count})`) : '';
      // Truncate label to fit
      const prefixLen = 2 + 4; // pointer + checkbox + space
      const maxLabel = Math.max(10, width - prefixLen - (g.count > 1 ? 6 : 0));
      let label = g.label;
      if (visibleWidth(label) > maxLabel) {
        label = label.slice(0, maxLabel - 1) + '…';
      }
      const labelStyled = isCursor ? chalk.red.bold(label) : chalk.red(label);
      lines.push(`${pointer}${checkbox} ${labelStyled}${countStr}`);
    }

    // LFG button
    lines.push('');
    const isLfgCursor = this.cursor === groups.length;
    const hasSelection = this.selected.size > 0;
    if (hasSelection) {
      const label = isLfgCursor
        ? chalk.bgGreen.black.bold(' Fix it for me! ')
        : chalk.green.bold(' Fix it for me! ');
      const pointer = isLfgCursor ? chalk.green('❯ ') : '  ';
      lines.push(`${pointer}${label}`);
    } else {
      const label = chalk.dim(' Fix it for me! ');
      const pointer = isLfgCursor ? chalk.dim('❯ ') : '  ';
      lines.push(`${pointer}${label}`);
    }

    return lines;
  }
}

class ServicesConfigMenu implements Component {
  private cursor = 0;
  onSubmit?: (shouldGenerate: boolean) => void;

  invalidate() {}

  handleInput(data: string) {
    if (matchesKey(data, 'left') || matchesKey(data, 'h')) {
      this.cursor = 0;
    } else if (matchesKey(data, 'right') || matchesKey(data, 'l')) {
      this.cursor = 1;
    } else if (matchesKey(data, 'up') || matchesKey(data, 'k')) {
      this.cursor = 0;
    } else if (matchesKey(data, 'down') || matchesKey(data, 'j')) {
      this.cursor = 1;
    } else if (matchesKey(data, 'enter')) {
      this.onSubmit?.(this.cursor === 0);
    }
  }

  render(): string[] {
    const lines: string[] = [];
    const generateSelected = this.cursor === 0;
    const skipSelected = this.cursor === 1;

    lines.push(
      chalk.white.bold(
        '  ● Do you want me to generate a vercel.json for these services?'
      )
    );
    lines.push('');
    lines.push(
      `${generateSelected ? chalk.white('❯ ') : '  '}${
        generateSelected
          ? chalk.bgWhite.black.bold(' Generate vercel.json ')
          : chalk.white.bold(' Generate vercel.json ')
      }`
    );
    lines.push(
      `${skipSelected ? chalk.dim('❯ ') : '  '}${
        skipSelected
          ? chalk.bgBlackBright.white.bold(' Skip ')
          : chalk.dim(' Skip ')
      }`
    );

    return lines;
  }
}

// ---------------------------------------------------------------------------
// StatusBar — switches between "Serving" and ErrorMenu
// ---------------------------------------------------------------------------
const INITIALIZING_FRAMES = ['  ●', '  ◉', '  ○', '  ◉'];
const SERVING_FRAMES = ['  ●', '  ◉', '  ○', '  ◉'];
const FIXING_FRAMES = ['  ▲', '  ▶', '  ▼', '  ◀'];
const ANIM_INTERVAL = 300;

type StatusBarState = 'initializing' | 'serving' | 'fixing';

class StatusBar implements Component {
  private menu: ErrorMenu;
  private servicesConfigMenu = new ServicesConfigMenu();
  private _showServicesConfigPrompt = false;
  private _state: StatusBarState = 'initializing';
  private _frame = 0;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _requestRender?: () => void;

  constructor(private errorStore: ErrorStore) {
    this.menu = new ErrorMenu(errorStore);
  }

  /** Must be called once so the animation can trigger TUI redraws. */
  bindRender(requestRender: () => void) {
    this._requestRender = requestRender;
    this.startAnim();
  }

  get errorMenu(): ErrorMenu {
    return this.menu;
  }

  get configMenu(): ServicesConfigMenu {
    return this.servicesConfigMenu;
  }

  get showServicesConfigPrompt(): boolean {
    return this._showServicesConfigPrompt;
  }

  set showServicesConfigPrompt(value: boolean) {
    this._showServicesConfigPrompt = value;
  }

  get state(): StatusBarState {
    return this._state;
  }

  set state(value: StatusBarState) {
    if (this._state !== value) {
      this._state = value;
      this._frame = 0;
    }
  }

  set fixing(value: boolean) {
    this.state = value ? 'fixing' : 'serving';
  }

  dispose() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private framesForState(): string[] {
    switch (this._state) {
      case 'initializing':
        return INITIALIZING_FRAMES;
      case 'fixing':
        return FIXING_FRAMES;
      case 'serving':
      default:
        return SERVING_FRAMES;
    }
  }

  private startAnim() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      const frames = this.framesForState();
      this._frame = (this._frame + 1) % frames.length;
      this._requestRender?.();
    }, ANIM_INTERVAL);
  }

  invalidate() {
    this.menu.invalidate();
    this.servicesConfigMenu.invalidate();
  }

  handleInput(data: string) {
    if (this._showServicesConfigPrompt && this._state === 'initializing') {
      this.servicesConfigMenu.handleInput(data);
      return;
    }

    if (this._state === 'serving' && this.errorStore.size > 0) {
      this.menu.handleInput(data);
    }
  }

  render(width: number): string[] {
    const separator = chalk.dim('─'.repeat(width));
    const lines: string[] = [];

    const frames = this.framesForState();
    const disc = frames[this._frame % frames.length];

    let statusLabel: string;
    switch (this._state) {
      case 'initializing':
        statusLabel = chalk.white(`${disc} Initializing`);
        break;
      case 'fixing':
        statusLabel = chalk.cyan(`${disc} Fixing…`);
        break;
      case 'serving':
      default:
        statusLabel = chalk.green(`${disc} Serving`);
        break;
    }

    if (this._showServicesConfigPrompt && this._state === 'initializing') {
      lines.push(separator);
      lines.push(...this.servicesConfigMenu.render());
      lines.push('');
      lines.push(separator);
      lines.push(statusLabel);
      lines.push('');
    } else if (this.errorStore.size > 0 && this._state === 'serving') {
      lines.push(separator);
      lines.push(...this.menu.render(width));
      lines.push('');
      lines.push(separator);
      lines.push(statusLabel);
      lines.push('');
    } else {
      lines.push(separator);
      lines.push(statusLabel);
      lines.push('');
    }

    return lines;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function startAgentMode(
  client: Client,
  opts: Partial<DevOptions>,
  args: string[],
  telemetry: DevTelemetryClient
): Promise<number> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const outputPanel = new Text('', 0, 0);

  // Error store drives the bottom status bar.
  const errorStore = new ErrorStore(() => {
    statusBar.errorMenu.sync();
    tui.requestRender();
  });

  const statusBar = new StatusBar(errorStore);

  tui.addChild(outputPanel);
  tui.addChild(new Spacer(1));
  tui.addChild(statusBar);
  tui.setFocus(statusBar);
  statusBar.bindRender(() => tui.requestRender());

  let outputBuffer = '';
  let renderScheduled = false;

  function appendOutput(text: string) {
    outputBuffer += text;
    outputPanel.setText(outputBuffer);
    if (!renderScheduled) {
      renderScheduled = true;
      queueMicrotask(() => {
        renderScheduled = false;
        tui.requestRender(true);
      });
    }
  }

  // Teardown / agent handoff state
  let tornDown = false;

  const errorChunker = new ErrorChunker((text: string) => {
    errorStore.push(text);
  });

  let agentSession:
    | Awaited<
        ReturnType<
          typeof import('@mariozechner/pi-coding-agent')['createAgentSession']
        >
      >['session']
    | null = null;

  async function promptToGenerateServicesConfig(): Promise<boolean> {
    return await new Promise<boolean>(resolve => {
      statusBar.showServicesConfigPrompt = true;
      statusBar.configMenu.onSubmit = shouldGenerate => {
        statusBar.showServicesConfigPrompt = false;
        statusBar.configMenu.onSubmit = undefined;
        tui.requestRender();
        resolve(shouldGenerate);
      };
      tui.requestRender();
    });
  }

  async function runFixAgent(groups: ErrorGroup[]) {
    // Build the prompt from the full text of each selected error
    const errorTexts = groups
      .map(
        (g, i) =>
          `--- Error ${i + 1} (seen ${g.count} time${g.count > 1 ? 's' : ''}) ---\n${g.latestFullText}`
      )
      .join('\n\n');

    // Remove selected errors from the store immediately
    const sigs = new Set(groups.map(g => g.signature));
    errorStore.remove(sigs);

    statusBar.fixing = true;
    tui.requestRender();

    try {
      const { createAgentSession, SessionManager, createCodingTools } =
        await import('@mariozechner/pi-coding-agent');

      const { session } = await createAgentSession({
        cwd: process.cwd(),
        tools: createCodingTools(process.cwd()),
        sessionManager: SessionManager.inMemory(),
      });
      agentSession = session;

      appendOutput(chalk.cyan('\n--- Agent fixing errors ---\n'));

      session.subscribe((event: { type: string; [key: string]: unknown }) => {
        switch (event.type) {
          case 'message_update': {
            const evt = event as {
              type: 'message_update';
              assistantMessageEvent: { type: string; delta?: string };
            };
            if (evt.assistantMessageEvent.type === 'text_delta') {
              appendOutput(truncateText(evt.assistantMessageEvent.delta ?? ''));
            }
            break;
          }
          case 'tool_execution_start': {
            const evt = event as {
              type: 'tool_execution_start';
              toolName: string;
              args: unknown;
            };
            appendOutput(formatToolStartLine(evt.toolName, evt.args));
            break;
          }
          case 'tool_execution_end': {
            const evt = event as {
              type: 'tool_execution_end';
              toolName: string;
              isError: boolean;
              error?: unknown;
              message?: unknown;
              result?: unknown;
            };
            appendOutput(
              evt.isError
                ? chalk.red(
                    `[${evt.toolName}] error: ${formatToolError({
                      error: evt.error,
                      message: evt.message,
                      result: evt.result,
                    })}\n`
                  )
                : formatToolDoneLine(evt.toolName)
            );
            break;
          }
          case 'agent_end': {
            appendOutput(chalk.cyan('\n--- Agent finished ---\n'));
            break;
          }
        }
      });

      await session.prompt(
        `Fix these errors from the dev server:\n\n${errorTexts}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendOutput(chalk.red(`\nAgent error: ${msg}\n`));
    } finally {
      if (agentSession) {
        agentSession.dispose();
        agentSession = null;
      }
      statusBar.fixing = false;
      tui.requestRender();
    }
  }

  // Wire LFG submit
  statusBar.errorMenu.onSubmit = (groups: ErrorGroup[]) => {
    void runFixAgent(groups);
  };

  tui.start();

  // Writable stream that feeds into the TUI output panel + error chunker.
  const tuiStream = new Writable({
    write(chunk, _encoding, callback) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      appendOutput(text);
      errorChunker.feed(text);
      callback();
    },
  });

  // Redirect the global output singleton through the TUI so that calls like
  // output.log(), output.spinner(), output.print() don't write directly to
  // the terminal and fight with the TUI rendering.
  const originalOutputStream = output.stream;
  output.initialize({
    stream: tuiStream as unknown as import('tty').WriteStream,
  });

  appendOutput(`${chalk.bold('Vercel Dev')} ${chalk.dim('(agent mode)')}\n\n`);

  // Teardown follows the pi-agent pattern: drain stdin, then stop TUI.
  async function teardownTUI() {
    if (tornDown) return;
    tornDown = true;
    output.initialize({ stream: originalOutputStream });
    errorChunker.dispose();
    statusBar.dispose();
    await new Promise<void>(resolve => process.nextTick(resolve));
    await terminal.drainInput(1000);
    tui.stop();
  }

  const ctx: DevContext = {
    stdout: tuiStream,
    stderr: tuiStream,
    willPrompt() {
      tornDown = true;
      output.initialize({ stream: originalOutputStream });
      tui.stop();
    },
    didPrompt() {
      tornDown = false;
      tui.start();
      output.initialize({
        stream: tuiStream as unknown as import('tty').WriteStream,
      });
    },
    onCleanupReady(cleanup) {
      tui.addInputListener((data: string) => {
        if (matchesKey(data, 'ctrl+c') || matchesKey(data, 'ctrl+d')) {
          teardownTUI().then(() => cleanup());
          return { consume: true };
        }
        return undefined;
      });
    },
    onShutdown: teardownTUI,
    onLLMEvent(event) {
      switch (event.type) {
        case 'prompt':
          appendOutput(
            chalk.dim(`\n[prompt] `) +
              chalk.dim(truncateText(event.text)) +
              '\n'
          );
          break;
        case 'tool_start':
          appendOutput(formatToolStartLine(event.toolName, event.args));
          break;
        case 'tool_end':
          appendOutput(
            event.isError
              ? chalk.red(`[${event.toolName}] error\n`)
              : formatToolDoneLine(event.toolName)
          );
          break;
      }
    },
    confirmGenerateServicesConfig() {
      return promptToGenerateServicesConfig();
    },
    onReady() {
      statusBar.state = 'serving';
      tui.requestRender();
    },
  };

  return startDevServer(client, opts, args, telemetry, ctx);
}
