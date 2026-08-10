import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import output from '../../output-manager';
import type { DetectedHarness, HarnessId } from './detect-harnesses';

/**
 * Hand the terminal to the agent's own interface, then take it back.
 *
 * The harness session and the agent's native TUI share one conversation
 * store: the bridge drives Claude Code with the workspace as its working
 * directory, so `claude --resume <id>` opens the very session onboard has been
 * orchestrating, and the bridge's per-turn `continue` picks the conversation
 * back up — including everything the user did natively — when the TUI exits.
 * Validated against the real binary: resume-by-id keeps the same session id
 * (no fork), and a later `--continue` in the cwd recalls the TUI turns.
 *
 * The gates and the ledger ride along for free: the spawned TUI inherits
 * `VERCEL_ONBOARD_SESSION_DIR` and the shimmed `PATH`, so every `vercel` the
 * agent runs still journals and still pauses on gated effects. The one
 * conflict is the terminal itself — the supervising process cannot prompt
 * while the TUI holds stdin in raw mode — and `withTerminal()` resolves it
 * by freezing the TUI for the duration of the prompt. See the method for the
 * mechanics and the measured behavior they rest on.
 */
interface NativeTuiCapability {
  /** Arguments that reopen the orchestrated session in the agent's own CLI. */
  args: (agentSessionId: string | undefined) => string[];
}

/**
 * Only Claude Code for now. The others have resume-by-id CLI forms too
 * (`codex resume <id>`, `opencode --session <id>`, `pi --session <id>`), but
 * each needs the same validation Claude Code got — that the SDK-driven and
 * interactive sessions actually share state — before being offered.
 */
const NATIVE_TUI: Partial<Record<HarnessId, NativeTuiCapability>> = {
  'claude-code': {
    args: agentSessionId =>
      agentSessionId ? ['--resume', agentSessionId] : ['--continue'],
  },
};

/**
 * Whether the "continue in the agent's own interface" hand-off can be offered.
 *
 * Requires the shim: without it the TUI's `vercel` would be whatever is on
 * PATH — no gates, no ledger — and the hand-off would silently drop the
 * supervision it promises to keep. Windows is excluded with it (the shim
 * already bails there, and the freeze/thaw below is POSIX job control).
 */
export function nativeTuiSupported(
  harness: DetectedHarness,
  options: { shimInstalled: boolean; isTTY: boolean }
): boolean {
  return (
    process.platform !== 'win32' &&
    options.shimInstalled &&
    options.isTTY &&
    Boolean(harness.binPath) &&
    harness.id in NATIVE_TUI
  );
}

/**
 * One hand-off target: spawns the TUI, tracks whether it owns the terminal,
 * and lends the terminal back to onboard for the length of an approval prompt.
 */
export class NativeTuiSession {
  private child: ChildProcess | undefined;

  /** Whether the TUI currently owns the terminal. */
  get active(): boolean {
    return this.child !== undefined && this.child.exitCode === null;
  }

  /**
   * Run the agent's own interface in the foreground until the user exits it.
   *
   * `stdio: 'inherit'` — the TUI gets the real terminal, not a pty onboard
   * would then have to proxy. Onboard keeps running (its approval watcher
   * keeps polling) but prints nothing while the child is alive.
   */
  run(
    harness: DetectedHarness,
    agentSessionId: string | undefined
  ): Promise<number> {
    const capability = NATIVE_TUI[harness.id];
    const binPath = harness.binPath;
    if (!capability || !binPath) {
      return Promise.resolve(1);
    }

    return new Promise<number>(resolve => {
      const child = spawn(binPath, capability.args(agentSessionId), {
        stdio: 'inherit',
      });
      this.child = child;

      child.on('error', err => {
        this.child = undefined;
        output.error(
          `Could not start ${harness.label}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        resolve(1);
      });
      child.on('exit', (code, signal) => {
        this.child = undefined;
        output.debug(
          `onboard: native TUI exited (code=${code} signal=${signal})`
        );
        resolve(code ?? 1);
      });
    });
  }

  /**
   * Freeze the TUI, take the terminal for `fn`, then hand both back.
   *
   * A no-op wrapper when the TUI is not running, so the ordinary orchestrated
   * flow is untouched. When it is, the sequence — each step validated against
   * the real Claude Code binary on a pty — is:
   *
   * 1. `SIGSTOP` the TUI. Claude Code ignores `SIGTSTP`, so the uncatchable
   *    stop is the only one that works. The signal goes to the pid alone,
   *    never the group: the gated `vercel` holding the approval request is a
   *    grandchild of the TUI's Bash tool and must keep polling.
   * 2. Save the terminal state and reset to sane. `SIGSTOP` being uncatchable
   *    means the TUI stays in raw mode; the prompt needs a cooked terminal
   *    and the TUI needs its raw state back afterwards, exactly as it left it.
   * 3. Run `fn` — the ordinary approval prompt, unchanged.
   * 4. Restore the saved state, `SIGCONT`, `SIGWINCH`. The response file is
   *    written by the watcher after this returns, so the user watches the
   *    approved command complete live in the TUI rather than into a frozen
   *    frame. (A result that lands while frozen also survives — measured —
   *    the ordering is for the experience, not for correctness.)
   */
  async withTerminal<T>(fn: () => Promise<T>): Promise<T> {
    const pid = this.active ? this.child?.pid : undefined;
    if (!pid) {
      return fn();
    }

    await freeze(pid);
    const saved = saveTerminalState();
    if (saved) {
      applyTerminalState('sane');
    }
    writeToTerminal(ENTER_PROMPT_SCREEN);
    try {
      return await fn();
    } finally {
      writeToTerminal(LEAVE_PROMPT_SCREEN);
      if (saved) {
        applyTerminalState(saved);
      }
      thaw(pid);
    }
  }
}

/**
 * Terminal-emulator modes the TUI sets that outlive a termios reset — the
 * `stty` dance restores the line discipline, but these live in the emulator.
 * With them still active, the approval prompt reads garbage: the Kitty
 * keyboard protocol delivers each keypress as a CSI-u sequence readline
 * echoes literally, focus reporting injects `[I`/`[O` on every window
 * switch, and pastes arrive wrapped in bracket markers. Observed on a real
 * gated session as escape noise scribbled across the frozen frame.
 *
 * The exact set mirrors what Claude Code 2.1.x enables, captured from a live
 * pty: kitty push (`>1u`), modifyOtherKeys (`>4;2m`), bracketed paste
 * (`?2004h`), focus reporting (`?1004h`), theme notifications (`?2031h`),
 * cursor hidden (`?25l`). Every sequence is a no-op on terminals that do not
 * support it.
 *
 * The prompt also runs on the alternate screen: the TUI's frame is preserved
 * underneath and returns untouched, and the prompt leaves no debris in
 * scrollback — the ledger is the durable record of the approval.
 */
export const ENTER_PROMPT_SCREEN =
  '\x1b[?1049h' + // alternate screen, preserving the TUI's frame beneath
  '\x1b[2J\x1b[H' + // cleared, cursor at the top
  '\x1b[<u' + // pop the TUI's Kitty keyboard mode
  '\x1b[>4;0m' + // modifyOtherKeys off
  '\x1b[?2004l' + // bracketed paste off
  '\x1b[?1004l' + // focus reporting off
  '\x1b[?2031l' + // theme-change notifications off
  '\x1b[?25h'; // the prompt needs a visible cursor

export const LEAVE_PROMPT_SCREEN =
  '\x1b[?25l' + // hidden again, as the TUI keeps it
  '\x1b[?2031h' +
  '\x1b[?1004h' +
  '\x1b[?2004h' +
  '\x1b[>4;2m' +
  '\x1b[>1u' + // push the keyboard mode back
  '\x1b[?1049l'; // main screen: the frame exactly as it was frozen

function writeToTerminal(sequence: string): void {
  try {
    if (process.stdout.isTTY) {
      process.stdout.write(sequence);
    }
  } catch {
    // A closed stream at teardown; the prompt will cope.
  }
}

/**
 * Stop the process and wait until the kernel reports it stopped, so the
 * prompt never races the TUI's renderer for the terminal. Bounded: if the
 * state never shows, proceed anyway — the worst case is cosmetic.
 */
async function freeze(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGSTOP');
  } catch {
    return; // Already gone; fn() runs with the terminal free.
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    if (processState(pid).startsWith('T')) {
      return;
    }
    await sleep(50);
  }
  output.debug('onboard: TUI did not report a stopped state; prompting anyway');
}

/**
 * Wake the TUI and nudge a repaint. `SIGCONT` alone repaints nothing
 * (measured); mid-turn the TUI's own render loop takes over immediately,
 * which is when gates fire, and `SIGWINCH` is a harmless extra prod.
 */
function thaw(pid: number): void {
  try {
    process.kill(pid, 'SIGCONT');
    process.kill(pid, 'SIGWINCH');
  } catch {
    // Exited while frozen-adjacent; nothing to wake.
  }
}

/** `ps` output for the pid's state, empty when the process is gone. */
function processState(pid: number): string {
  try {
    const result = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.status === 0 ? result.stdout.toString().trim() : '';
  } catch {
    return '';
  }
}

/**
 * The termios dance, via `stty` so no native bindings are needed. The stty
 * child inherits onboard's stdin — the shared terminal — which is exactly
 * the device whose state is being saved and restored.
 */
function saveTerminalState(): string | undefined {
  try {
    const result = spawnSync('stty', ['-g'], {
      stdio: ['inherit', 'pipe', 'ignore'],
    });
    if (result.status === 0) {
      const state = result.stdout.toString().trim();
      return state.length > 0 ? state : undefined;
    }
  } catch {
    // Fall through: prompt without the dance rather than not at all.
  }
  return undefined;
}

function applyTerminalState(state: string): void {
  try {
    spawnSync('stty', [state], { stdio: ['inherit', 'ignore', 'ignore'] });
  } catch {
    // Best effort; inquirer sets the modes it needs itself.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
