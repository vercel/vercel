import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import output from '../../output-manager';
import { LEDGER_FILENAME } from '../../util/onboard-session';

/**
 * Where an onboard session keeps its working data — and afterwards, its
 * record.
 *
 * The directory lives next to the harness's own run data in
 * `<workspace>/.agent-runs/`, so everything a run produced (the agent's event
 * log, the CLI's ledger) is in one gitignored place, keyed per run. During the
 * session it also holds the transient machinery: the `vercel`/`vc` shims in
 * `bin/` and the approval handshake in `approvals/`. On teardown the machinery
 * is deleted and the ledger stays — it is the machine's record of what the
 * session did, and a later session can read it.
 */
const RUNS_DIRNAME = '.agent-runs';
const ONBOARD_DIRNAME = 'onboard';

/** Ledgers kept per workspace; ISO-named directories sort chronologically. */
const KEEP_SESSIONS = 20;

export interface SessionStorage {
  dir: string;
  /** Under the workspace, so the ledger outlives the session. */
  persistent: boolean;
}

/**
 * Create the session directory, preferring `.agent-runs/onboard/<iso>-<pid>` in
 * the workspace. The name carries the pid for the same reason the profiles do:
 * sessions killed together finish in the same millisecond.
 *
 * A workspace that cannot be written falls back to a temp directory — the
 * session still works; only the record does not persist.
 */
export async function createSessionDir(
  workspace: string
): Promise<SessionStorage> {
  try {
    const runsDir = join(workspace, RUNS_DIRNAME);
    await mkdir(join(runsDir, ONBOARD_DIRNAME), { recursive: true });
    // The same guard the harness writes: nothing under here is committed.
    await writeFile(join(runsDir, '.gitignore'), '*\n', { flag: 'wx' }).catch(
      () => undefined
    );
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
    const dir = join(runsDir, ONBOARD_DIRNAME, name);
    await mkdir(dir);
    return { dir, persistent: true };
  } catch (error) {
    output.debug(
      `onboard: falling back to a temp session dir: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {
      dir: await mkdtemp(join(tmpdir(), 'vercel-onboard-')),
      persistent: false,
    };
  }
}

/**
 * End-of-session cleanup: the shims and the approval handshake are machinery
 * and go; the ledger is the record and stays. A session that recorded nothing
 * leaves nothing behind, and old records are pruned to the newest few.
 */
export async function finalizeSessionDir(
  storage: SessionStorage
): Promise<void> {
  if (!storage.persistent) {
    await rm(storage.dir, { recursive: true, force: true }).catch(
      () => undefined
    );
    return;
  }

  for (const transient of ['bin', 'approvals']) {
    await rm(join(storage.dir, transient), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  }

  const hasLedger = await stat(join(storage.dir, LEDGER_FILENAME)).then(
    () => true,
    () => false
  );
  if (!hasLedger) {
    await rm(storage.dir, { recursive: true, force: true }).catch(
      () => undefined
    );
  }

  await pruneSessions(join(storage.dir, '..'));
}

async function pruneSessions(onboardDir: string): Promise<void> {
  try {
    const entries = (await readdir(onboardDir)).sort();
    const stale = entries.slice(0, Math.max(0, entries.length - KEEP_SESSIONS));
    for (const entry of stale) {
      await rm(join(onboardDir, entry), { recursive: true, force: true });
    }
  } catch {
    // Pruning is housekeeping; never let it fail the session.
  }
}
