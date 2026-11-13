import type { InputEvent } from './keys';
import type { Line } from './text';
import process from 'node:process';
import { parseInput } from './keys';
import { toAnsi } from './text';

/** What a full-screen app provides: a frame for a size, and input handling. */
export interface ScreenApp {
  view: (width: number, height: number) => Line[];
  handle: (event: InputEvent) => void;
}

/** What the app can ask of the screen. */
export interface Host {
  /** Schedule a redraw (coalesced). */
  render: () => void;
  exit: () => void;
}

interface TerminalIn {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  setEncoding: (encoding: BufferEncoding) => unknown;
  on: (event: 'data', listener: (chunk: string) => void) => unknown;
  off: (event: 'data', listener: (chunk: string) => void) => unknown;
  resume: () => unknown;
  pause: () => unknown;
}

interface TerminalOut {
  columns?: number;
  rows?: number;
  write: (text: string) => unknown;
  on: (event: 'resize', listener: () => void) => unknown;
  off: (event: 'resize', listener: () => void) => unknown;
}

// Alternate screen, hidden cursor, SGR mouse, bracketed paste, kitty keys (disambiguate).
const ENTER =
  '\u001B[?1049h\u001B[2J\u001B[?25l\u001B[?1000h\u001B[?1006h\u001B[?2004h\u001B[>1u';
const LEAVE =
  '\u001B[<u\u001B[?2004l\u001B[?1000l\u001B[?1006l\u001B[?25h\u001B[?1049l';
// Synchronized output: the terminal shows the frame at once, without tearing.
const SYNC_START = '\u001B[?2026h';
const SYNC_END = '\u001B[?2026l';
/** How long a lone ESC waits for the rest of a sequence before it counts as the Escape key. */
const ESCAPE_TIMEOUT = 40;

/** Rewrite only the rows that changed since the last frame. */
export function diffFrame(previous: string[], next: string[]): string {
  let out = '';
  next.forEach((line, row) => {
    if (line !== previous[row]) out += `\u001B[${row + 1};1H${line}\u001B[K`;
  });
  return out;
}

/**
 * Run `create`'s app full screen until it calls `host.exit()`. The terminal is restored on exit,
 * and on process exit if something crashes.
 */
export function runFullScreen(
  terminal: { stdin: TerminalIn; stdout: TerminalOut },
  create: (host: Host) => ScreenApp
): Promise<void> {
  const { stdin, stdout } = terminal;
  return new Promise(resolve => {
    let previous: string[] = [];
    let scheduled = false;
    let done = false;
    let rest = '';
    let escapeTimer: ReturnType<typeof setTimeout> | undefined;
    // Assigned once the host exists; `create` receives the host.
    let app: ScreenApp;

    const draw = (): void => {
      scheduled = false;
      if (done) return;
      const width = stdout.columns || 80;
      const height = stdout.rows || 24;
      const lines = app.view(width, height).slice(0, height).map(toAnsi);
      while (lines.length < height) lines.push('');
      stdout.write(SYNC_START + diffFrame(previous, lines) + SYNC_END);
      previous = lines;
    };

    const host: Host = {
      render: () => {
        if (!scheduled) {
          scheduled = true;
          setImmediate(draw);
        }
      },
      exit: () => {
        if (done) return;
        done = true;
        clearTimeout(escapeTimer);
        stdin.off('data', onData);
        stdout.off('resize', onResize);
        process.off('exit', restore);
        restore();
        stdin.setRawMode?.(false);
        stdin.pause();
        resolve();
      },
    };

    const dispatch = (events: InputEvent[]): void => {
      for (const event of events) {
        if (!done) app.handle(event);
      }
    };

    function onData(chunk: string): void {
      clearTimeout(escapeTimer);
      const parsed = parseInput(rest + chunk);
      rest = parsed.rest;
      dispatch(parsed.events);
      if (rest) {
        // A lone ESC is the Escape key; any other unfinished sequence that never completes is noise.
        escapeTimer = setTimeout(() => {
          const pending = rest;
          rest = '';
          if (pending === '\u001B') {
            dispatch([
              {
                kind: 'key',
                name: 'escape',
                ctrl: false,
                meta: false,
                shift: false,
              },
            ]);
          }
        }, ESCAPE_TIMEOUT);
      }
    }

    function onResize(): void {
      previous = [];
      stdout.write('\u001B[2J');
      host.render();
    }

    function restore(): void {
      stdout.write(LEAVE);
    }

    app = create(host);
    stdout.write(ENTER);
    process.once('exit', restore);
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
    stdout.on('resize', onResize);
    draw();
  });
}
