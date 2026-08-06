/**
 * The in-session trigger for the native hand-off: press ctrl+t while the
 * agent works, drop into its own interface when the current turn ends.
 *
 * While a turn streams, ship's stdin is idle — no prompt is open, nothing
 * reads it. This listener puts it in raw mode for exactly that window and
 * watches for one key. Raw mode has a cost: the terminal stops turning
 * ctrl+c into SIGINT, and ship's abort path (the profile-on-abort handler)
 * depends on that signal. So the listener translates the byte itself, after
 * restoring the terminal — a swallowed ctrl+c would be far worse than no
 * hand-off key.
 *
 * Everything that genuinely needs the terminal mid-turn — the approval
 * prompt, an `askUser` question — wraps itself in `suspendDuring()`, so the
 * listener and inquirer never fight over raw mode.
 */

/** ctrl+t. Deliberately a control chord: a stray plain letter must not queue a hand-off. */
const HANDOFF_KEY = 0x14;
const SIGINT_KEY = 0x03;

/**
 * The slice of a TTY read stream the listener needs, structural so tests can
 * fake it. `process.stdin` satisfies it.
 */
export interface KeySource {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume: () => unknown;
  pause: () => unknown;
  on: (event: 'data', listener: (chunk: Buffer) => void) => unknown;
  off: (event: 'data', listener: (chunk: Buffer) => void) => unknown;
}

export class HandoffKeyListener {
  private armed = false;
  private pending = false;

  constructor(
    private readonly options: {
      stdin: KeySource;
      /** Fired once when the key is first pressed, for immediate feedback. */
      onRequest: () => void;
      /** Injectable for tests; defaults to signalling this process. */
      raiseSigint?: () => void;
    }
  ) {}

  /** Start listening. A no-op without a TTY, or when already armed. */
  arm(): void {
    const { stdin } = this.options;
    if (this.armed || !stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      return;
    }
    this.armed = true;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', this.onData);
  }

  /** Stop listening and hand the terminal back in its cooked state. */
  disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    const { stdin } = this.options;
    stdin.off('data', this.onData);
    try {
      stdin.setRawMode?.(false);
    } catch {
      // The stream may be gone at teardown; nothing to restore on.
    }
    stdin.pause();
  }

  /**
   * Lend the terminal to `fn` — an inquirer prompt — and re-arm afterwards
   * only if the listener was armed going in, so a between-turns prompt does
   * not arm a listener nobody will disarm.
   */
  async suspendDuring<T>(fn: () => Promise<T>): Promise<T> {
    const wasArmed = this.armed;
    this.disarm();
    try {
      return await fn();
    } finally {
      if (wasArmed) {
        this.arm();
      }
    }
  }

  /** Whether a hand-off has been requested, without clearing it. */
  get hasPending(): boolean {
    return this.pending;
  }

  /** Read-and-clear, called at the boundary where the hand-off can run. */
  consumePending(): boolean {
    const pending = this.pending;
    this.pending = false;
    return pending;
  }

  private onData = (chunk: Buffer): void => {
    for (const byte of chunk) {
      if (byte === SIGINT_KEY) {
        // Restore the terminal before raising: the abort handler exits the
        // process, and a raw terminal must not be what it leaves behind.
        this.disarm();
        (this.options.raiseSigint ?? raiseSigint)();
        return;
      }
      if (byte === HANDOFF_KEY && !this.pending) {
        this.pending = true;
        this.options.onRequest();
      }
    }
  };
}

function raiseSigint(): void {
  process.kill(process.pid, 'SIGINT');
}

/**
 * Decides the moment a queued hand-off actually interrupts the turn.
 *
 * The first cut waited for a `finish-step` part, and a real run showed why
 * that is wrong: the boundary only exists where a tool batch settles, so a
 * ctrl+t pressed as the agent starts a long report waits out the whole
 * report. The agent's own interrupt key stops generation mid-sentence and
 * the truncated message is persisted; matching that, the turn is interrupted
 * on the very next stream part — with one exception: never while a tool call
 * is in flight, because cutting a running `vercel deploy` half-way is worse
 * than reading one more sentence. Tool calls are counted in and out, and the
 * interrupt fires the moment none is open.
 */
export interface HandoffInterrupt {
  /** True once the interrupt has fired; the abort that follows is ours. */
  aborted: boolean;
  onPart(type: string): void;
}

export function createHandoffInterrupt(options: {
  keys: HandoffKeyListener;
  /** Fires exactly once, at the chosen moment. */
  onAbort: () => void;
}): HandoffInterrupt {
  let openToolCalls = 0;
  return {
    aborted: false,
    onPart(type: string): void {
      if (type === 'tool-call') {
        openToolCalls += 1;
      } else if (type === 'tool-result' || type === 'tool-error') {
        openToolCalls = Math.max(0, openToolCalls - 1);
      }
      if (this.aborted || !options.keys.hasPending || openToolCalls > 0) {
        return;
      }
      this.aborted = true;
      options.onAbort();
    },
  };
}
