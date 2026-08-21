import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import output from '../../output-manager';
import {
  readLedger,
  recordSessionEvent,
  type LedgerEvent,
} from '../../util/onboard-session';

/**
 * The onboard browser bridge: what happens when a command inside the session
 * tries to open a browser and there is none.
 *
 * Marketplace checkout inside a headless session used to die on
 * `spawn xdg-open ENOENT`, with the checkout URL lost at debug level. The
 * session already owns the child environment (the `vercel`/`vc` shims), so
 * it also installs an `xdg-open` shim into the same session `bin/`
 * directory. The `open` package resolves `xdg-open` from `PATH` on Linux —
 * exactly where the failure lived — and lands on the bridge instead.
 *
 * The shim is deliberately dumb: it writes its first argument to a spool
 * file and exits 0. No JSON, no exec, no network. The supervising onboard
 * process watches the spool, validates the URL, journals the typed
 * `browser-handoff` event, and shows the human a copyable URL. Validation
 * and rendering stay in this process, where they can be tested.
 *
 * macOS needs no bridge: `open(1)` always exists there, and a desktop
 * browser is the normal case. Windows is a no-op for the same reason the
 * CLI shim is.
 */

export const HANDOFF_SPOOL_DIRNAME = 'handoffs';

export type HandoffStatus = 'waiting' | 'opened' | 'completed' | 'expired';

/**
 * Install the `xdg-open` bridge into the session's bin directory (the one
 * `installCliShim` already prepended to `PATH`). Best-effort, like the CLI
 * shim: a session without the bridge merely degrades to today's behavior.
 */
export async function installBrowserBridge(
  sessionDir: string,
  binDir: string
): Promise<boolean> {
  if (process.platform === 'win32') {
    return false;
  }

  try {
    const spoolDir = join(sessionDir, HANDOFF_SPOOL_DIRNAME);
    await mkdir(spoolDir, { recursive: true });

    // `mv` after the write, so the watcher (which reads only `*.url`) never
    // sees a half-written file. Never executes anything; `"$1"` is data.
    const script = [
      '#!/bin/sh',
      '# vercel onboard browser bridge: capture the URL, never fail the caller.',
      `SPOOL=${shellQuote(spoolDir)}`,
      'f=$(mktemp "$SPOOL/handoff-XXXXXX" 2>/dev/null) || exit 0',
      'printf \'%s\' "$1" > "$f" 2>/dev/null || exit 0',
      'mv "$f" "$f.url" 2>/dev/null',
      'exit 0',
      '',
    ].join('\n');

    const path = join(binDir, 'xdg-open');
    await writeFile(path, script);
    await chmod(path, 0o755);
    return true;
  } catch (error) {
    output.debug(
      `onboard: could not install the browser bridge: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Only URLs the platform itself hands to a checkout flow are surfaced:
 * https, on a Vercel-owned host. Anything else is logged and dropped — the
 * bridge must never become a way for arbitrary child output to put a
 * clickable URL in front of the user.
 */
export function isAllowedHandoffUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  return url.hostname === 'vercel.com' || url.hostname.endsWith('.vercel.com');
}

/**
 * Onboard's side of the bridge: polls the spool directory, journals each
 * captured URL as a `browser-handoff` event, and hands it to the renderer.
 * Modeled on `ApprovalWatcher` — same directory-handshake shape, without
 * the response half.
 */
export class BrowserHandoffWatcher {
  private timer: NodeJS.Timeout | undefined;
  private readonly handled = new Set<string>();

  constructor(
    private readonly sessionDir: string,
    private readonly onHandoff: (url: string) => void,
    private readonly pollMs: number = 500
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.scan();
    }, this.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Exposed for tests and for a final sweep before teardown. */
  async scan(): Promise<void> {
    const dir = join(this.sessionDir, HANDOFF_SPOOL_DIRNAME);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return; // No bridge installed, or nothing captured yet.
    }

    for (const entry of entries) {
      if (!entry.endsWith('.url') || this.handled.has(entry)) continue;

      let url: string;
      try {
        url = (await readFile(join(dir, entry), 'utf-8')).trim();
      } catch {
        continue; // Being moved into place; next tick gets it.
      }
      this.handled.add(entry);
      await rm(join(dir, entry), { force: true }).catch(() => undefined);

      if (!isAllowedHandoffUrl(url)) {
        output.debug(
          'onboard: browser bridge captured a URL outside the allowlist — dropped.'
        );
        continue;
      }

      // The full URL goes to the local session record and the user's own
      // terminal — the user needs it verbatim to complete checkout. It is
      // never sent anywhere else.
      recordSessionEvent({
        type: 'browser-handoff',
        url,
        status: 'waiting' satisfies HandoffStatus,
      });
      try {
        this.onHandoff(url);
      } catch (error) {
        output.debug(
          `onboard: browser handoff renderer failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }
}

/**
 * Handoffs whose newest journaled status still needs something: the user
 * has not finished (`waiting`/`opened`) or the session ended first
 * (`expired`).
 */
export function unresolvedHandoffs(ledger: LedgerEvent[]): string[] {
  return [...latestStatusByUrl(ledger)]
    .filter(([, status]) => status !== 'completed')
    .map(([url]) => url);
}

/**
 * Journal `expired` for every handoff still pending — called at session
 * teardown, so the record says what was left unfinished and a resumed
 * session offers to continue it instead of assuming the checkout happened.
 */
export async function expirePendingHandoffs(sessionDir: string): Promise<void> {
  for (const [url, status] of latestStatusByUrl(await readLedger(sessionDir))) {
    if (status === 'waiting' || status === 'opened') {
      recordSessionEvent({ type: 'browser-handoff', url, status: 'expired' });
    }
  }
}

/**
 * Journal `completed` for every unresolved handoff — called when the user
 * chooses "Continue provider setup", which is them saying the checkout is
 * done. The agent is still instructed to verify the resource exists rather
 * than trust the click.
 */
export async function completePendingHandoffs(
  sessionDir: string
): Promise<void> {
  for (const [url, status] of latestStatusByUrl(await readLedger(sessionDir))) {
    if (status !== 'completed') {
      recordSessionEvent({ type: 'browser-handoff', url, status: 'completed' });
    }
  }
}

function latestStatusByUrl(ledger: LedgerEvent[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const event of ledger) {
    if (
      event.type === 'browser-handoff' &&
      typeof event.url === 'string' &&
      typeof event.status === 'string'
    ) {
      latest.set(event.url, event.status);
    }
  }
  return latest;
}

/** Single-quote a path for /bin/sh, escaping embedded single quotes. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
