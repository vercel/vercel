import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { onboardVerify } from '../../../../src/commands/onboard/verify';

// The command's only client-layer dependency: token acquisition. Mocked so
// the test owns exactly what a refresh returns, without a mock API.
vi.mock('../../../../src/commands/curl/shared', () => ({
  getFullUrlAndToken: vi.fn(),
}));

import { getFullUrlAndToken } from '../../../../src/commands/curl/shared';

const mockedGetToken = vi.mocked(getFullUrlAndToken);

/** A Vercel Authentication redirect — the protection signal. */
function protectedRedirect(): Response {
  return new Response('Redirecting...', {
    status: 302,
    headers: {
      location: 'https://vercel.com/sso-api?url=x&nonce=abc',
    },
  });
}

describe('onboard verify — command', () => {
  let cwd: string;
  let sessionDir: string;
  const fetchMock = vi.fn();

  beforeEach(() => {
    cwd = setupTmpDir();
    client.cwd = cwd;
    sessionDir = join(cwd, '.session');
    mkdirSync(sessionDir, { recursive: true });
    process.env.VERCEL_ONBOARD_SESSION_DIR = sessionDir;
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    mockedGetToken.mockReset();
  });

  afterEach(() => {
    delete process.env.VERCEL_ONBOARD_SESSION_DIR;
    vi.unstubAllGlobals();
  });

  it('journals protection retries and failure classes, never the token', async () => {
    // First acquisition: a stale token; the refresh mints a fresh one.
    mockedGetToken
      .mockResolvedValueOnce({
        fullUrl: 'https://app.vercel.app',
        deploymentProtectionToken: 'stale-secret-token',
      } as never)
      .mockResolvedValueOnce({
        fullUrl: 'https://app.vercel.app',
        deploymentProtectionToken: 'fresh-secret-token',
      } as never);

    // Pass 1: protection blocks the check; pass 2 (refreshed token): passes.
    fetchMock
      .mockResolvedValueOnce(protectedRedirect())
      .mockResolvedValue(new Response('ok', { status: 200 }));

    const manifestPath = join(cwd, 'verify.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        deployment: 'https://app.vercel.app',
        checks: [{ path: '/', expect: { status: 200 } }],
      })
    );

    const exitCode = await onboardVerify(client, [manifestPath]);
    expect(exitCode).toBe(0);

    const ledger = readFileSync(join(sessionDir, 'ledger.ndjson'), 'utf-8');
    const events = ledger
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const verification = events.find(event => event.type === 'verification');

    expect(verification).toMatchObject({
      deployment: 'https://app.vercel.app',
      passed: 1,
      failed: 0,
      attempts: 2,
      protectionRetries: 1,
    });
    // The token never lands in the ledger, under any key.
    expect(ledger).not.toContain('stale-secret-token');
    expect(ledger).not.toContain('fresh-secret-token');
  });

  it('derives milestones conjunctively: a failed GET un-verifies persistence', async () => {
    mockedGetToken.mockResolvedValue({
      fullUrl: 'https://app.vercel.app',
      deploymentProtectionToken: null,
    } as never);
    // POST passes, the GET that reads it back fails.
    fetchMock
      .mockResolvedValueOnce(new Response('created', { status: 201 }))
      .mockResolvedValue(new Response('oops', { status: 500 }));

    const manifestPath = join(cwd, 'verify.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        deployment: 'https://app.vercel.app',
        checks: [
          {
            method: 'POST',
            path: '/api/todos',
            body: { title: 'x' },
            expect: { status: 201 },
            proves: ['write-verified', 'cross-request-persistence-verified'],
          },
          {
            path: '/api/todos',
            expect: { status: 200, bodyContains: 'x' },
            proves: ['read-verified', 'cross-request-persistence-verified'],
          },
        ],
      })
    );

    const exitCode = await onboardVerify(client, [manifestPath]);
    expect(exitCode).toBe(1);

    const stdout = await client.stdout.getFullOutput();
    expect(stdout).toContain('Milestones verified: write-verified');
    expect(stdout).toContain(
      'Milestones NOT verified: cross-request-persistence-verified, read-verified'
    );

    const events = readFileSync(join(sessionDir, 'ledger.ndjson'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const verification = events.find(event => event.type === 'verification');
    expect(verification.milestones).toEqual({
      verified: ['write-verified'],
      unverified: ['cross-request-persistence-verified', 'read-verified'],
    });
  });

  it('records both write and persistence when POST-then-GET both pass', async () => {
    mockedGetToken.mockResolvedValue({
      fullUrl: 'https://app.vercel.app',
      deploymentProtectionToken: null,
    } as never);
    fetchMock
      .mockResolvedValueOnce(new Response('created', { status: 201 }))
      .mockResolvedValue(new Response('[{"title":"x"}]', { status: 200 }));

    const manifestPath = join(cwd, 'verify.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        deployment: 'https://app.vercel.app',
        checks: [
          {
            method: 'POST',
            path: '/api/todos',
            body: { title: 'x' },
            expect: { status: 201 },
            proves: ['write-verified', 'cross-request-persistence-verified'],
          },
          {
            path: '/api/todos',
            expect: { status: 200, bodyContains: 'x' },
            proves: ['cross-request-persistence-verified'],
          },
        ],
      })
    );

    expect(await onboardVerify(client, [manifestPath])).toBe(0);

    const events = readFileSync(join(sessionDir, 'ledger.ndjson'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const verification = events.find(event => event.type === 'verification');
    expect(verification.milestones.verified).toEqual(
      expect.arrayContaining([
        'write-verified',
        'cross-request-persistence-verified',
      ])
    );
    expect(verification.milestones.unverified).toEqual([]);
  });

  it('journals no milestones when the manifest claims none', async () => {
    mockedGetToken.mockResolvedValue({
      fullUrl: 'https://app.vercel.app',
      deploymentProtectionToken: null,
    } as never);
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    const manifestPath = join(cwd, 'verify.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        deployment: 'https://app.vercel.app',
        checks: [{ path: '/' }],
      })
    );

    expect(await onboardVerify(client, [manifestPath])).toBe(0);
    const events = readFileSync(join(sessionDir, 'ledger.ndjson'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const verification = events.find(event => event.type === 'verification');
    expect(verification.milestones).toBeUndefined();
  });

  it('journals the failure class when protection stays blocking', async () => {
    mockedGetToken.mockResolvedValue({
      fullUrl: 'https://app.vercel.app',
      deploymentProtectionToken: null,
    } as never);
    fetchMock.mockImplementation(async () => protectedRedirect());

    const manifestPath = join(cwd, 'verify.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        deployment: 'https://app.vercel.app',
        checks: [{ path: '/' }],
      })
    );

    const exitCode = await onboardVerify(client, [manifestPath]);
    expect(exitCode).toBe(1);

    const output = await client.stdout.getFullOutput();
    expect(output).toContain('Deployment Protection blocked 1 check');

    const events = readFileSync(join(sessionDir, 'ledger.ndjson'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const verification = events.find(event => event.type === 'verification');
    expect(verification.protectionBlocked).toBe(1);
    expect(verification.checks[0].failureClass).toBe('deployment-protection');
  });
});
