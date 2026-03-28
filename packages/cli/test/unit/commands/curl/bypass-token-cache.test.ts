import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';

let tmpDir: string;

vi.mock('../../../../src/util/config/global-path', () => ({
  default: () => tmpDir,
}));

const { getCachedBypassToken, setCachedBypassToken } = await import(
  '../../../../src/commands/curl/bypass-token-cache'
);

describe('bypass-token-cache', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'vc-bypass-cache-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no cache file exists', async () => {
    const token = await getCachedBypassToken('https://my-app.vercel.app/api');
    expect(token).toBeNull();
  });

  it('stores and retrieves a token by hostname', async () => {
    await setCachedBypassToken(
      'https://my-app.vercel.app/api/hello',
      'tok_abc',
      'prj_123'
    );

    const token = await getCachedBypassToken(
      'https://my-app.vercel.app/other/path'
    );
    expect(token).toBe('tok_abc');
  });

  it('returns null for a different hostname', async () => {
    await setCachedBypassToken(
      'https://my-app.vercel.app/api',
      'tok_abc',
      'prj_123'
    );

    const token = await getCachedBypassToken(
      'https://other-app.vercel.app/api'
    );
    expect(token).toBeNull();
  });

  it('stores tokens for multiple hosts independently', async () => {
    await setCachedBypassToken('https://app-a.vercel.app', 'tok_a', 'prj_a');
    await setCachedBypassToken('https://app-b.vercel.app', 'tok_b', 'prj_b');

    expect(await getCachedBypassToken('https://app-a.vercel.app')).toBe(
      'tok_a'
    );
    expect(await getCachedBypassToken('https://app-b.vercel.app')).toBe(
      'tok_b'
    );
  });

  it('overwrites a previously cached token for the same host', async () => {
    await setCachedBypassToken('https://my-app.vercel.app', 'tok_old', 'prj_1');
    await setCachedBypassToken('https://my-app.vercel.app', 'tok_new', 'prj_1');

    const token = await getCachedBypassToken('https://my-app.vercel.app');
    expect(token).toBe('tok_new');
  });

  it('handles corrupt cache file gracefully', async () => {
    await writeFile(join(tmpDir, 'bypass-tokens.json'), 'not json');

    const token = await getCachedBypassToken('https://my-app.vercel.app');
    expect(token).toBeNull();
  });

  it('persists tokens to disk as JSON', async () => {
    await setCachedBypassToken(
      'https://my-app.vercel.app',
      'tok_disk',
      'prj_disk'
    );

    const raw = await readFile(join(tmpDir, 'bypass-tokens.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.tokens['my-app.vercel.app']).toMatchObject({
      token: 'tok_disk',
      projectId: 'prj_disk',
    });
    expect(typeof parsed.tokens['my-app.vercel.app'].cachedAt).toBe('number');
  });
});
