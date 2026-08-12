import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
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
  /** True when this directory was reopened by `--resume`, not created. */
  resumed?: boolean;
}

/** Filename of the record `--resume` looks for. */
export const SESSION_RECORD_FILENAME = 'session.json';

/**
 * What a later run needs in order to pick this session back up.
 *
 * Written next to the ledger, because the two answer the same question from
 * different sides: the ledger is what the session did, this is how to carry
 * on doing it. The agent-side id is the load-bearing field — without it a
 * resume can only start a new conversation, which is not a resume.
 */
export interface SessionRecord {
  harnessId: string;
  /** The harness's own session id, passed back to `createSession`. */
  harnessSessionId?: string;
  /**
   * The agent's own id for the conversation — Claude Code's transcript id.
   *
   * This is what makes a resume land in the right place. The harness can
   * otherwise only ask the agent CLI to continue "the most recent thread in
   * this directory", which stops being the right thread the moment a second
   * one exists — including one started by a resume that itself failed to
   * resume.
   */
  agentSessionId?: string;
  workspace: string;
  startedAt: number;
  updatedAt: number;
}

export interface ResumableSession {
  dir: string;
  record: SessionRecord;
}

/**
 * The lifecycle state that puts the harness on its resume path.
 *
 * Two things have to be true for a resume to land where the user left off,
 * and neither is the session id:
 *
 *  - `resumeFrom` must be present at all. The adapter decides `isResume` from
 *    its presence; `sessionId` alone only names the run directory, so passing
 *    it by itself produces a brand-new conversation in an old folder.
 *  - `data.claudeSessionId` must name the thread. Without it the adapter falls
 *    back to "continue the most recent conversation in this workdir", which is
 *    the wrong one as soon as a second exists there.
 *
 * `data` is adapter-defined and validated against the harness's own loose
 * schema, so an empty object is valid and simply means "resume, target
 * unspecified".
 */
export function buildResumeState(
  harnessId: string,
  record: SessionRecord
): {
  type: 'resume-session';
  harnessId: string;
  specificationVersion: 'harness-v1';
  data: Record<string, string>;
} {
  return {
    type: 'resume-session',
    harnessId,
    specificationVersion: 'harness-v1',
    data: record.agentSessionId
      ? { claudeSessionId: record.agentSessionId }
      : {},
  };
}

/**
 * Record how to resume this session, overwriting any previous record.
 *
 * Best-effort for the same reason the ledger is: a session that cannot write
 * its own bookkeeping should still run. The cost of failure is that
 * `--resume` will not find it, not that the turn breaks.
 */
export async function writeSessionRecord(
  dir: string,
  record: SessionRecord
): Promise<void> {
  try {
    await writeFile(
      join(dir, SESSION_RECORD_FILENAME),
      `${JSON.stringify(record, null, 2)}\n`
    );
  } catch (error) {
    output.debug(
      `onboard: could not write the session record: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * The most recent resumable session for this workspace.
 *
 * Newest first by directory name, which sorts chronologically by
 * construction. A record naming a different workspace is skipped rather than
 * trusted: session directories live under the workspace, but a moved or
 * copied tree would otherwise resume a conversation rooted somewhere else.
 */
export async function findResumableSession(
  workspace: string
): Promise<ResumableSession | undefined> {
  const onboardDir = join(workspace, RUNS_DIRNAME, ONBOARD_DIRNAME);

  let entries: string[];
  try {
    entries = (await readdir(onboardDir)).sort().reverse();
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    const dir = join(onboardDir, entry);
    try {
      const raw = await readFile(join(dir, SESSION_RECORD_FILENAME), 'utf-8');
      const record = JSON.parse(raw) as SessionRecord;
      if (
        typeof record?.harnessId === 'string' &&
        record.workspace === workspace
      ) {
        return { dir, record };
      }
    } catch {
      // No record, unreadable, or not this workspace: keep looking back.
    }
  }

  return undefined;
}

/**
 * Reopen an existing session directory for a resumed run.
 *
 * The machinery `finalizeSessionDir` removed (`bin/`, `approvals/`) is
 * recreated by the callers that own it, so only the directory itself has to
 * still be there.
 */
export async function openSessionDir(dir: string): Promise<SessionStorage> {
  await mkdir(dir, { recursive: true });
  return { dir, persistent: true, resumed: true };
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

  // A session that recorded nothing remotely can still be worth resuming —
  // the expensive part is the conversation, not the effects — so the record
  // keeps the directory alive on its own.
  const [hasLedger, hasRecord] = await Promise.all([
    stat(join(storage.dir, LEDGER_FILENAME)).then(
      () => true,
      () => false
    ),
    stat(join(storage.dir, SESSION_RECORD_FILENAME)).then(
      () => true,
      () => false
    ),
  ]);
  if (!hasLedger && !hasRecord) {
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
