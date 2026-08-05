import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import output from '../../output-manager';
import type { DetectedHarness, HarnessId } from './detect-harnesses';

/**
 * Hand the terminal to the agent's own interface, then take it back.
 *
 * The harness session and the agent's native TUI share one conversation
 * store: the bridge drives Claude Code with the workspace as its working
 * directory, so `claude --resume <id>` opens the very session ship has been
 * orchestrating, and the bridge's per-turn `continue` picks the conversation
 * back up — including everything the user did natively — when the TUI exits.
 * Validated against the real binary: resume-by-id keeps the same session id
 * (no fork), and a later `--continue` in the cwd recalls the TUI turns.
 *
 * The gates and the ledger ride along for free: the spawned TUI inherits
 * `VERCEL_SHIP_SESSION_DIR` and the shimmed `PATH`, so every `vercel` the
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
 * and lends the terminal back to ship for the length of an approval prompt.
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
   * `stdio: 'inherit'` — the TUI gets the real terminal, not a pty ship would
   * then have to proxy. Ship keeps running (its approval watcher keeps
   * polling) but prints nothing while the child is alive.
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
        output.debug(`ship: native TUI exited (code=${code} signal=${signal})`);
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
    try {
      return await fn();
    } finally {
      if (saved) {
        applyTerminalState(saved);
      }
      thaw(pid);
    }
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
  output.debug('ship: TUI did not report a stopped state; prompting anyway');
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
 * child inherits ship's stdin — the shared terminal — which is exactly the
 * device whose state is being saved and restored.
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
