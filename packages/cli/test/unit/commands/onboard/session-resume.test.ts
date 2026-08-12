import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSessionDir,
  finalizeSessionDir,
  findResumableSession,
  openSessionDir,
  writeSessionRecord,
  buildResumeState,
  SESSION_RECORD_FILENAME,
} from '../../../../src/commands/onboard/session-storage';

/**
 * `--resume` is only as good as the record it finds, and the record is only
 * useful if it survives the exit paths a session actually takes — including
 * the abrupt ones. These tests pin both halves.
 */

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'onboard-resume-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** The directory layout a real session leaves behind. */
async function seedSession(
  name: string,
  record?: Record<string, unknown>,
  ledger?: string
): Promise<string> {
  const dir = join(workspace, '.agent-runs', 'onboard', name);
  await mkdir(dir, { recursive: true });
  if (record) {
    await writeFile(join(dir, SESSION_RECORD_FILENAME), JSON.stringify(record));
  }
  if (ledger) {
    await writeFile(join(dir, 'ledger.ndjson'), ledger);
  }
  return dir;
}

describe('findResumableSession', () => {
  it('returns nothing when the workspace has never run a session', async () => {
    expect(await findResumableSession(workspace)).toBeUndefined();
  });

  it('returns nothing when a session left no record', async () => {
    await seedSession('2026-01-01T00-00-00-000Z-1', undefined, '{}\n');
    expect(await findResumableSession(workspace)).toBeUndefined();
  });

  it('finds the record a session wrote', async () => {
    const dir = await seedSession('2026-01-01T00-00-00-000Z-1', {
      harnessId: 'claude-code',
      harnessSessionId: 'abc-123',
      workspace,
      startedAt: 1,
      updatedAt: 2,
    });

    const found = await findResumableSession(workspace);
    expect(found?.dir).toBe(dir);
    expect(found?.record.harnessSessionId).toBe('abc-123');
  });

  it('prefers the most recent session', async () => {
    await seedSession('2026-01-01T00-00-00-000Z-1', {
      harnessId: 'claude-code',
      harnessSessionId: 'older',
      workspace,
      startedAt: 1,
      updatedAt: 1,
    });
    const newer = await seedSession('2026-06-01T00-00-00-000Z-2', {
      harnessId: 'claude-code',
      harnessSessionId: 'newer',
      workspace,
      startedAt: 2,
      updatedAt: 2,
    });

    const found = await findResumableSession(workspace);
    expect(found?.dir).toBe(newer);
    expect(found?.record.harnessSessionId).toBe('newer');
  });

  it('skips a newer session whose record is unreadable', async () => {
    const good = await seedSession('2026-01-01T00-00-00-000Z-1', {
      harnessId: 'codex',
      harnessSessionId: 'good',
      workspace,
      startedAt: 1,
      updatedAt: 1,
    });
    const broken = join(
      workspace,
      '.agent-runs',
      'onboard',
      '2026-06-01T00-00-00-000Z-2'
    );
    await mkdir(broken, { recursive: true });
    await writeFile(join(broken, SESSION_RECORD_FILENAME), 'not json');

    expect((await findResumableSession(workspace))?.dir).toBe(good);
  });

  it('ignores a record belonging to another workspace', async () => {
    // A copied or moved tree: the directory is here, the conversation is not.
    await seedSession('2026-01-01T00-00-00-000Z-1', {
      harnessId: 'claude-code',
      harnessSessionId: 'elsewhere',
      workspace: '/somewhere/else',
      startedAt: 1,
      updatedAt: 1,
    });

    expect(await findResumableSession(workspace)).toBeUndefined();
  });
});

describe('writeSessionRecord', () => {
  it('round-trips through findResumableSession', async () => {
    const storage = await createSessionDir(workspace);
    await writeSessionRecord(storage.dir, {
      harnessId: 'claude-code',
      harnessSessionId: 'sess-1',
      workspace,
      startedAt: 10,
      updatedAt: 20,
    });

    const found = await findResumableSession(workspace);
    expect(found?.record).toMatchObject({
      harnessId: 'claude-code',
      harnessSessionId: 'sess-1',
      workspace,
    });
  });

  it('overwrites rather than appending, so the newest id wins', async () => {
    const storage = await createSessionDir(workspace);
    const base = {
      harnessId: 'claude-code',
      workspace,
      startedAt: 1,
      updatedAt: 1,
    };
    await writeSessionRecord(storage.dir, {
      ...base,
      harnessSessionId: 'first',
    });
    await writeSessionRecord(storage.dir, {
      ...base,
      harnessSessionId: 'second',
    });

    const raw = await readFile(
      join(storage.dir, SESSION_RECORD_FILENAME),
      'utf-8'
    );
    expect(JSON.parse(raw).harnessSessionId).toBe('second');
  });

  it('never throws when the directory is gone', async () => {
    await expect(
      writeSessionRecord(join(workspace, 'missing'), {
        harnessId: 'claude-code',
        workspace,
        startedAt: 1,
        updatedAt: 1,
      })
    ).resolves.toBeUndefined();
  });
});

describe('buildResumeState', () => {
  const record = {
    harnessId: 'claude-code',
    harnessSessionId: 'harness-1',
    agentSessionId: 'c04d4fe7-c0cc-466e-99dc-c03ebd4725dc',
    workspace: '/ws',
    startedAt: 1,
    updatedAt: 2,
  };

  it('is a resume-session lifecycle state the adapter will accept', () => {
    expect(buildResumeState('claude-code', record)).toMatchObject({
      type: 'resume-session',
      harnessId: 'claude-code',
      specificationVersion: 'harness-v1',
    });
  });

  it('names the exact conversation to reopen', () => {
    // Without this the adapter continues "the most recent thread in the
    // workdir", which is the wrong one once a second thread exists.
    expect(buildResumeState('claude-code', record).data).toEqual({
      claudeSessionId: 'c04d4fe7-c0cc-466e-99dc-c03ebd4725dc',
    });
  });

  it('still resumes when no conversation id was ever recorded', () => {
    const { agentSessionId, ...withoutAgentId } = record;
    expect(agentSessionId).toBeTruthy();

    const state = buildResumeState('claude-code', withoutAgentId);
    // Present but empty: resume semantics on, target unspecified.
    expect(state.type).toBe('resume-session');
    expect(state.data).toEqual({});
  });
});

describe('openSessionDir', () => {
  it('reopens an existing directory and marks it resumed', async () => {
    const dir = await seedSession('2026-01-01T00-00-00-000Z-1', {
      harnessId: 'claude-code',
      workspace,
      startedAt: 1,
      updatedAt: 1,
    });

    const storage = await openSessionDir(dir);
    expect(storage).toEqual({ dir, persistent: true, resumed: true });
  });

  it('keeps the ledger already in the directory', async () => {
    const dir = await seedSession(
      '2026-01-01T00-00-00-000Z-1',
      { harnessId: 'claude-code', workspace, startedAt: 1, updatedAt: 1 },
      '{"type":"deployment"}\n'
    );

    await openSessionDir(dir);
    const ledger = await readFile(join(dir, 'ledger.ndjson'), 'utf-8');
    expect(ledger).toContain('deployment');
  });
});

describe('finalizeSessionDir', () => {
  it('keeps a session that recorded nothing but is resumable', async () => {
    // The conversation is the expensive part; a session with no remote
    // effects is still worth being able to pick back up.
    const storage = await createSessionDir(workspace);
    await writeSessionRecord(storage.dir, {
      harnessId: 'claude-code',
      harnessSessionId: 'sess-1',
      workspace,
      startedAt: 1,
      updatedAt: 1,
    });

    await finalizeSessionDir(storage);

    expect(await findResumableSession(workspace)).toBeDefined();
  });

  it('still removes a session that recorded nothing at all', async () => {
    const storage = await createSessionDir(workspace);

    await finalizeSessionDir(storage);

    await expect(stat(storage.dir)).rejects.toThrow();
  });

  it('removes the transient machinery but keeps the record', async () => {
    const storage = await createSessionDir(workspace);
    await mkdir(join(storage.dir, 'bin'), { recursive: true });
    await mkdir(join(storage.dir, 'approvals'), { recursive: true });
    await writeSessionRecord(storage.dir, {
      harnessId: 'claude-code',
      workspace,
      startedAt: 1,
      updatedAt: 1,
    });

    await finalizeSessionDir(storage);

    await expect(stat(join(storage.dir, 'bin'))).rejects.toThrow();
    await expect(stat(join(storage.dir, 'approvals'))).rejects.toThrow();
    await expect(
      stat(join(storage.dir, SESSION_RECORD_FILENAME))
    ).resolves.toBeDefined();
  });
});
