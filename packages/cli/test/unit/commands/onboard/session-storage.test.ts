import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSessionDir,
  finalizeSessionDir,
} from '../../../../src/commands/onboard/session-storage';

describe('onboard session storage', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'onboard-storage-test-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('creates the session dir next to the harness run data, gitignored', async () => {
    const storage = await createSessionDir(workspace);
    expect(storage.persistent).toBe(true);
    expect(storage.dir).toContain(join(workspace, '.agent-runs', 'onboard'));
    expect(
      await readFile(join(workspace, '.agent-runs', '.gitignore'), 'utf-8')
    ).toBe('*\n');
  });

  it('does not clobber a .gitignore the harness already wrote', async () => {
    await mkdir(join(workspace, '.agent-runs'), { recursive: true });
    await writeFile(
      join(workspace, '.agent-runs', '.gitignore'),
      '# theirs\n*\n'
    );
    await createSessionDir(workspace);
    expect(
      await readFile(join(workspace, '.agent-runs', '.gitignore'), 'utf-8')
    ).toBe('# theirs\n*\n');
  });

  it('keeps the ledger and removes the machinery on finalize', async () => {
    const storage = await createSessionDir(workspace);
    await mkdir(join(storage.dir, 'bin'));
    await mkdir(join(storage.dir, 'approvals'));
    await writeFile(join(storage.dir, 'ledger.ndjson'), '{"type":"command"}\n');

    await finalizeSessionDir(storage);

    const remaining = await readdir(storage.dir);
    expect(remaining).toEqual(['ledger.ndjson']);
  });

  it('leaves nothing behind when the session recorded nothing', async () => {
    const storage = await createSessionDir(workspace);
    await mkdir(join(storage.dir, 'bin'));

    await finalizeSessionDir(storage);

    const sessions = await readdir(join(workspace, '.agent-runs', 'onboard'));
    expect(sessions).toEqual([]);
  });

  it('prunes old session records, keeping the newest', async () => {
    const onboardDir = join(workspace, '.agent-runs', 'onboard');
    await mkdir(onboardDir, { recursive: true });
    // ISO-shaped names sort chronologically.
    for (let i = 10; i < 33; i++) {
      await mkdir(join(onboardDir, `2026-01-${i}T00-00-00-000Z-1`));
    }

    const storage = await createSessionDir(workspace);
    await writeFile(join(storage.dir, 'ledger.ndjson'), '{"type":"command"}\n');
    await finalizeSessionDir(storage);

    const sessions = (await readdir(onboardDir)).sort();
    expect(sessions.length).toBe(20);
    // The newest survive; the oldest were pruned.
    expect(sessions[0] > '2026-01-13').toBe(true);
    expect(sessions).toContain(storage.dir.split('/').pop());
  });

  it('falls back to a temp dir when the workspace is not writable', async () => {
    const file = join(workspace, 'a-file');
    await writeFile(file, '');
    const storage = await createSessionDir(file);
    expect(storage.persistent).toBe(false);
    expect(storage.dir).not.toContain(workspace);

    // And a non-persistent finalize removes everything.
    await finalizeSessionDir(storage);
    await expect(readdir(storage.dir)).rejects.toThrow();
  });
});
