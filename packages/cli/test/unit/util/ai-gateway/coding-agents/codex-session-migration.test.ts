import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planCodexSessionMigration } from '../../../../../src/util/ai-gateway/coding-agents/migrations/codex-sessions';
const SOURCE_ID = '019e944c-b55e-7af2-9ed6-013d2e573834';
const DESTINATION_ID = '0a3177c2-57d7-5a55-a907-6164c5df6850';
describe('planCodexSessionMigration', () => {
  let home: string;
  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'vercel-codex-sessions-'));
    vi.stubEnv('CODEX_HOME', '');
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(home, { recursive: true, force: true });
  });
  async function createRollout(
    directory: string,
    id = SOURCE_ID,
    payload = {},
    rest = '{"type":"event","payload":"unchanged"}\n'
  ): Promise<{ path: string; content: Buffer }> {
    await fs.mkdir(directory, { recursive: true });
    const path = join(directory, `rollout-2026-07-27T00-00-00-${id}.jsonl`);
    const content = Buffer.from(
      `${JSON.stringify({
        type: 'session_meta',
        payload: {
          id,
          session_id: id,
          originator: 'Codex Desktop',
          model_provider: 'openai',
          ...payload,
        },
      })}\n${rest}`
    );
    await fs.writeFile(path, content.toString('utf8'), { mode: 0o640 });
    return { path, content };
  }
  it('finds only eligible Desktop rollouts and respects CODEX_HOME', async () => {
    const codexHome = join(home, 'custom-codex');
    vi.stubEnv('CODEX_HOME', codexHome);
    const sessions = join(codexHome, 'sessions');
    await createRollout(
      join(sessions, 'older'),
      '22222222-2222-4222-8222-222222222222',
      { originator: undefined, source: 'vscode' }
    );
    await fs.writeFile(join(sessions, 'rollout-cold.jsonl.zst'), 'compressed');
    await expect(planCodexSessionMigration(home)).rejects.toThrow(
      '--no-session-migration'
    );
    await fs.unlink(join(sessions, 'rollout-cold.jsonl.zst'));
    await createRollout(join(sessions, 'huge'), SOURCE_ID, {
      padding: 'x'.repeat(1024 ** 2),
    });
    await expect(planCodexSessionMigration(home)).rejects.toThrow(
      'metadata exceeds 1 MiB'
    );
  });
  it('copies atomically without changing the source or rollout body', async () => {
    const directory = join(home, '.codex', 'sessions', '2026', '07', '27');
    const source = await createRollout(
      directory,
      SOURCE_ID,
      {},
      '{"type":"event","payload":"keep  \\t"}\r\nlast-line'
    );
    const plan = await planCodexSessionMigration(home);
    await expect(plan!.apply()).resolves.toEqual({
      copied: 1,
      skipped: 0,
      errors: [],
    });
    const destination = join(
      directory,
      `rollout-2026-07-27T00-00-00-${DESTINATION_ID}.jsonl`
    );
    const [sourceAfter, destinationContent] = await Promise.all([
      fs.readFile(source.path),
      fs.readFile(destination),
    ]);
    expect(sourceAfter).toEqual(source.content);
    expect(
      destinationContent.subarray(destinationContent.indexOf(0x0a) + 1)
    ).toEqual(source.content.subarray(source.content.indexOf(0x0a) + 1));
    const metadata = JSON.parse(
      destinationContent
        .subarray(0, destinationContent.indexOf(0x0a))
        .toString()
    );
    expect(metadata.payload).toMatchObject({
      id: DESTINATION_ID,
      session_id: DESTINATION_ID,
      model_provider: 'vercel',
    });
    // Windows has no Unix file modes — 0o600 comes back as 0o666.
    if (process.platform !== 'win32') {
      expect((await fs.stat(destination)).mode & 0o777).toBe(0o600);
    }
    expect(await planCodexSessionMigration(home)).toBeNull();
  });
  it('includes archived sessions and never overwrites a new destination', async () => {
    const archived = join(home, '.codex', 'archived_sessions');
    await createRollout(archived);
    const removed = await createRollout(
      join(home, '.codex', 'sessions'),
      '22222222-2222-4222-8222-222222222222'
    );
    const plan = await planCodexSessionMigration(home);
    const destination = join(
      archived,
      `rollout-2026-07-27T00-00-00-${DESTINATION_ID}.jsonl`
    );
    await fs.writeFile(destination, 'existing destination', 'utf8');
    await fs.unlink(removed.path);
    await expect(plan!.apply()).resolves.toMatchObject({
      copied: 0,
      skipped: 0,
      errors: [
        expect.stringContaining('ENOENT'),
        expect.stringContaining('is invalid'),
      ],
    });
    expect(await fs.readFile(destination, 'utf8')).toBe('existing destination');
    await expect(planCodexSessionMigration(home)).rejects.toThrow('is invalid');
  });
});
