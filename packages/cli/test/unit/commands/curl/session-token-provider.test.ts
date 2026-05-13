import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { client } from '../../../mocks/client';
import { getSessionToken } from '../../../../src/commands/curl/session-token-provider';

const TEAM_ID = 'team_dummy';
const PROJECT_ID = 'prj_static';
const DEPLOYMENT_ID = 'dpl_test_abc123';
const HOST_URL = 'https://static-project-abc123.vercel.app/api/hello';
const HOST = 'static-project-abc123.vercel.app';

function cachePathFor(dir: string, teamId: string | undefined, host: string) {
  const key = `${teamId ?? ''}:${host}`;
  const filename = `${createHash('sha256').update(key).digest('hex')}.json`;
  return join(dir, filename);
}

function mockSessionEndpoint({
  token,
  expiresAt,
  onCall,
}: {
  token: string;
  expiresAt?: number;
  onCall?: (body: unknown, query: Record<string, unknown>) => void;
}) {
  client.scenario.post('/v1/projects/traces/session', (req, res) => {
    onCall?.(req.body, req.query);
    const payload: { token: string; expiresAt?: number } = { token };
    if (typeof expiresAt === 'number') {
      payload.expiresAt = expiresAt;
    }
    res.json(payload);
  });
}

describe('getSessionToken', () => {
  let cacheDir: string;

  beforeEach(() => {
    client.reset();
    cacheDir = mkdtempSync(join(tmpdir(), 'trace-cache-test-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('hit-fresh: returns cached token with zero API calls when not near expiry', async () => {
    let apiCalls = 0;
    mockSessionEndpoint({
      token: 'fresh-from-api',
      onCall: () => apiCalls++,
    });

    // Pre-populate cache with a future expiry
    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        token: 'cached-token',
        expiresAt: Date.now() + 5 * 60 * 1000,
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      }),
      { mode: 0o600 }
    );

    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
    });

    expect(result.token).toBe('cached-token');
    expect(result.fromCache).toBe(true);
    expect(apiCalls).toBe(0);
  });

  it('hit-near-expiry: re-issues when expiresAt - now < 30s', async () => {
    let apiCalls = 0;
    mockSessionEndpoint({
      token: 'fresh-from-api',
      expiresAt: Date.now() + 5 * 60 * 1000,
      onCall: () => apiCalls++,
    });

    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    await mkdir(cacheDir, { recursive: true });
    // Within the 30s buffer — should re-issue.
    await writeFile(
      path,
      JSON.stringify({
        token: 'almost-expired',
        expiresAt: Date.now() + 15 * 1000,
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      }),
      { mode: 0o600 }
    );

    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
    });

    expect(result.token).toBe('fresh-from-api');
    expect(result.fromCache).toBe(false);
    expect(apiCalls).toBe(1);
  });

  it('miss: calls API and writes cache when no cache file exists', async () => {
    let capturedBody: unknown;
    let capturedQuery: Record<string, unknown> | undefined;
    const expiresAt = Date.now() + 5 * 60 * 1000;
    mockSessionEndpoint({
      token: 'fresh-from-api',
      expiresAt,
      onCall: (body, query) => {
        capturedBody = body;
        capturedQuery = query;
      },
    });

    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
    });

    expect(result.token).toBe('fresh-from-api');
    expect(result.fromCache).toBe(false);
    expect(result.expiresAt).toBe(expiresAt);
    expect(capturedBody).toEqual({
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
    });
    // Team is scoped via the query string (authTeamReq resolves it from there),
    // not the request body.
    expect(capturedQuery?.teamId).toBe(TEAM_ID);

    // Cache file was written
    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written).toEqual({
      token: 'fresh-from-api',
      expiresAt,
      deploymentId: DEPLOYMENT_ID,
      schemaVersion: 1,
    });
  });

  it('corrupt-cache: silently re-issues when cache JSON is invalid', async () => {
    let apiCalls = 0;
    mockSessionEndpoint({
      token: 'fresh-after-corrupt',
      onCall: () => apiCalls++,
    });

    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path, '{not valid json', { mode: 0o600 });

    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
    });

    expect(result.token).toBe('fresh-after-corrupt');
    expect(result.fromCache).toBe(false);
    expect(apiCalls).toBe(1);

    // Cache was overwritten with valid contents
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.token).toBe('fresh-after-corrupt');
    expect(written.schemaVersion).toBe(1);
  });

  it('401-evict-then-reissue: evictedToken removes matching cache entry then re-issues', async () => {
    let apiCalls = 0;
    mockSessionEndpoint({
      token: 'fresh-after-evict',
      expiresAt: Date.now() + 5 * 60 * 1000,
      onCall: () => apiCalls++,
    });

    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        token: 'cached-but-stale',
        expiresAt: Date.now() + 5 * 60 * 1000,
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      }),
      { mode: 0o600 }
    );

    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
      evictedToken: 'cached-but-stale',
    });

    expect(result.token).toBe('fresh-after-evict');
    expect(result.fromCache).toBe(false);
    expect(apiCalls).toBe(1);

    // Cache was re-written with the fresh token
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.token).toBe('fresh-after-evict');
  });

  it('perms-on-write: cache file is created with mode 0600', async () => {
    mockSessionEndpoint({
      token: 'fresh',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
    });

    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('uses now + 5 min when API response omits expiresAt', async () => {
    mockSessionEndpoint({ token: 'no-expiry-from-api' });

    const before = Date.now();
    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
    });
    const after = Date.now();

    // Fallback TTL is 5 minutes from "now"
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 5 * 60 * 1000);
    expect(result.expiresAt).toBeLessThanOrEqual(after + 5 * 60 * 1000);
  });

  it('evictedToken with non-matching token does not delete cache entry', async () => {
    let apiCalls = 0;
    mockSessionEndpoint({
      token: 'should-not-be-used',
      onCall: () => apiCalls++,
    });

    const path = cachePathFor(cacheDir, TEAM_ID, HOST);
    await mkdir(cacheDir, { recursive: true });
    const expiresAt = Date.now() + 5 * 60 * 1000;
    writeFileSync(
      path,
      JSON.stringify({
        token: 'real-cached',
        expiresAt,
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      })
    );

    const result = await getSessionToken({
      client,
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      host: HOST_URL,
      cacheDir,
      evictedToken: 'some-other-token',
    });

    // Cache entry survives, token from cache is returned, API not called
    expect(result.token).toBe('real-cached');
    expect(result.fromCache).toBe(true);
    expect(apiCalls).toBe(0);
  });
});
