import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { client } from '../../../mocks/client';
import curl from '../../../../src/commands/curl';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Route the session-token-provider's cache writes into a tmpdir per test.
// `getGlobalPathConfig` normally returns `~/.vercel`; we redirect it so
// the integration tests don't pollute the user's home dir. `vi.hoisted`
// runs before `vi.mock` so the ref is initialized when the mock factory
// executes during module hoisting.
const globalConfigRef = vi.hoisted(() => ({ dir: '' }));
vi.mock('../../../../src/util/config/global-path', () => ({
  default: () => globalConfigRef.dir,
}));

const PROD_ALIAS = 'static-project-prod.vercel.app';
const PREVIEW_ALIAS = 'static-project-abc123.vercel.app';
const DEPLOYMENT_ID = 'dpl_test_abc123';
const TRACE_TOKEN = 'jwt-trace-token-deadbeef';
const REFRESHED_TOKEN = 'jwt-refreshed-token-cafef00d';
const X_VERCEL_ID = 'sfo1::abc-1234567890-deadbeef';
const USER_ID = 'u_test_user_abc';

function tracesCachePath() {
  return join(globalConfigRef.dir, 'cache', 'traces');
}

function cachePathFor(teamId: string | undefined, host: string) {
  const key = `${teamId ?? ''}:${host}`;
  const filename = `${createHash('sha256').update(key).digest('hex')}.json`;
  return join(tracesCachePath(), filename);
}

let spawnMock: ReturnType<typeof vi.fn>;

interface SpawnResponse {
  status?: number;
  bodyText?: string;
  xVercelId?: string | null;
  exitCode?: number;
}

/**
 * Mock implementation of `spawn` that emulates curl writing the response
 * headers to the path supplied via `--dump-header <path>`. Body, when curl's
 * stdout is piped (i.e. our --json mode), is fed from `bodyText`.
 *
 * Accepts either a single response config or a sequence — the i-th `spawn`
 * call uses the i-th entry (with the last entry repeated if more spawns
 * happen than responses). The sequence form is used by the 401-retry test.
 */
function installSpawnMock(config: SpawnResponse | SpawnResponse[] = {}) {
  const sequence: SpawnResponse[] = Array.isArray(config) ? config : [config];
  let callIndex = 0;

  spawnMock.mockImplementation((_cmd: string, args: string[], opts: any) => {
    const current = sequence[Math.min(callIndex++, sequence.length - 1)];
    const {
      status = 200,
      bodyText = '',
      xVercelId = X_VERCEL_ID,
      exitCode = 0,
    } = current;

    const dumpIdx = args.indexOf('--dump-header');
    const headerPath = dumpIdx !== -1 ? args[dumpIdx + 1] : undefined;

    if (headerPath) {
      const reason = status === 200 ? 'OK' : 'Unauthorized';
      const lines = [
        `HTTP/1.1 ${status} ${reason}`,
        'content-type: application/json',
      ];
      if (xVercelId) {
        lines.push(`x-vercel-id: ${xVercelId}`);
      }
      writeFileSync(headerPath, lines.join('\r\n') + '\r\n\r\n');
    }

    const stdoutPiped = opts?.stdio?.[1] === 'pipe';
    const stdout = stdoutPiped ? Readable.from([bodyText]) : null;

    const listeners: Record<string, Function[]> = {};
    const child: any = {
      stdout,
      on(event: string, handler: Function) {
        (listeners[event] ||= []).push(handler);
        if (event === 'close') {
          setTimeout(() => handler(exitCode), 0);
        }
        return child;
      },
    };
    return child;
  });
}

function mockSessionEndpoint(
  capturedBody: {
    value: unknown;
    query?: Record<string, unknown>;
    calls: number;
  },
  responseTokens: string[] = [TRACE_TOKEN]
) {
  let idx = 0;
  client.scenario.post('/v1/projects/traces/session', (req, res) => {
    capturedBody.value = req.body;
    capturedBody.query = req.query;
    capturedBody.calls += 1;
    const token = responseTokens[Math.min(idx++, responseTokens.length - 1)];
    // Include expiresAt so the cache stores a real future expiry (5 min from now).
    res.json({ token, expiresAt: Date.now() + 5 * 60 * 1000 });
  });
}

function mockDeploymentLookup({
  target,
  ownerId = 'team_dummy',
  projectId = 'static',
  id = DEPLOYMENT_ID,
}: {
  target: 'production' | 'staging' | null;
  ownerId?: string;
  projectId?: string;
  id?: string;
}) {
  client.scenario.get('/v13/deployments/:host', (_req: any, res: any) => {
    res.json({
      id,
      url: `${id}.vercel.app`,
      target,
      ownerId,
      projectId,
    });
  });
}

async function setupLinkedProject({
  productionAlias,
}: {
  productionAlias?: string;
} = {}) {
  const { setupUnitFixture } = await import(
    '../../../helpers/setup-unit-fixture'
  );
  const cwd = setupUnitFixture('commands/deploy/static');
  client.cwd = cwd;

  useUser({ id: USER_ID });
  useTeams('team_dummy');
  useProject({
    id: 'static',
    name: 'static-project',
    targets: productionAlias
      ? ({ production: { alias: [productionAlias] } } as any)
      : undefined,
    latestDeployments: [{ url: PREVIEW_ALIAS }],
  });
  // The trace flow reads `authConfig.userId` to set the `_vercel_session`
  // cookie. Pre-populate it to mirror the cached state of an authenticated
  // CLI; the fallback `getUser` path is exercised in a dedicated test.
  client.authConfig.userId = USER_ID;
}

describe('curl --trace', () => {
  beforeEach(async () => {
    client.reset();
    client.stdin.isTTY = true;
    globalConfigRef.dir = mkdtempSync(join(tmpdir(), 'trace-global-config-'));
    const childProcess = await import('child_process');
    spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    rmSync(globalConfigRef.dir, { recursive: true, force: true });
  });

  it('preview happy path: body to stdout, two stderr lines, request id from x-vercel-id', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);
    installSpawnMock();

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);

    expect(exitCode).toEqual(0);

    // Cookie API was called with the right body. The team is scoped via the
    // `teamId` query string parameter, not the body.
    expect(captured.value).toEqual({
      projectId: 'static',
      deploymentId: DEPLOYMENT_ID,
    });
    expect(captured.query?.teamId).toBe('team_dummy');

    // spawn was invoked with --header Cookie: _vercel_tracing=<token>;
    // _vercel_session=<userId>
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--header');
    expect(args).toContain(
      `Cookie: _vercel_tracing=${TRACE_TOKEN}; _vercel_session=${USER_ID}`
    );
    expect(args).toContain('--dump-header');

    // Default mode: stderr carries the two lines
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`Trace request id: ${X_VERCEL_ID}`);
    expect(stderr).toContain(
      `Run \`vercel traces get ${X_VERCEL_ID}\` to fetch the trace.`
    );

    // --trace was tracked
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:path', value: 'slash' },
      { key: 'option:protection-bypass', value: '[REDACTED]' },
      { key: 'flag:trace', value: 'TRUE' },
    ]);
  });

  it('--json: JSON envelope to stdout, no trace lines on stderr', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);
    installSpawnMock({ bodyText: '{"hello":"world"}' });

    // Capture stdout directly
    let stdoutBuf = '';
    const writeSpy = vi
      .spyOn(client.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutBuf += chunk;
        return true;
      });

    client.setArgv(
      'curl',
      '--trace',
      '--json',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);

    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.requestId).toBe(X_VERCEL_ID);
    expect(parsed.response).toBe('{"hello":"world"}');

    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('Trace request id:');
    expect(stderr).not.toContain('vercel traces get');

    writeSpy.mockRestore();
  });

  it('production deployment: non-TTY without --yes exits 1 with actionable message', async () => {
    await setupLinkedProject({ productionAlias: PROD_ALIAS });
    mockDeploymentLookup({ target: 'production' });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);
    installSpawnMock();

    client.stdin.isTTY = false;

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);

    expect(exitCode).toEqual(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Use --yes to capture traces on production from non-interactive contexts.'
    );

    // We must not have called the cookie API since we bailed before that.
    expect(captured.value).toBeUndefined();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('production deployment: --yes skips prompt and proceeds', async () => {
    await setupLinkedProject({ productionAlias: PROD_ALIAS });
    mockDeploymentLookup({ target: 'production' });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);
    installSpawnMock();

    client.stdin.isTTY = false; // non-interactive — --yes is the only way

    // Ensure no prompt happens
    const confirmSpy = vi.spyOn(client.input, 'confirm');

    client.setArgv(
      'curl',
      '--trace',
      '--yes',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);

    expect(exitCode).toEqual(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(captured.value).toMatchObject({
      projectId: 'static',
    });
    expect(captured.query?.teamId).toBe('team_dummy');
    expect(spawnMock).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it('user-supplied Cookie after -- is preserved alongside injected tracing cookie', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    mockSessionEndpoint({ value: undefined, calls: 0 });
    installSpawnMock();

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret',
      '--',
      '--header',
      'Cookie: session=user-supplied'
    );
    const exitCode = await curl(client);

    expect(exitCode).toEqual(0);

    const [, args] = spawnMock.mock.calls[0];
    // Our injected cookie header (trace + session, on one Cookie line)
    expect(args).toContain(
      `Cookie: _vercel_tracing=${TRACE_TOKEN}; _vercel_session=${USER_ID}`
    );
    // User's cookie header still in place (curl natively merges multi-Cookie headers)
    expect(args).toContain('Cookie: session=user-supplied');
  });

  it('cache miss: calls session API once and writes cache file with 0600 perms', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);
    installSpawnMock();

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);
    expect(exitCode).toEqual(0);

    expect(captured.calls).toBe(1);

    const cachePath = cachePathFor('team_dummy', PREVIEW_ALIAS);
    const written = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(written.token).toBe(TRACE_TOKEN);
    expect(written.deploymentId).toBe(DEPLOYMENT_ID);
    expect(written.schemaVersion).toBe(1);

    // NTFS doesn't enforce Unix mode bits, so chmod's narrowing to 0o600
    // is a no-op on Windows and `stat.mode` reports the default 0o666.
    if (process.platform !== 'win32') {
      const mode = statSync(cachePath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('cache hit: pre-populated cache short-circuits session API call', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured, ['should-not-be-called']);
    installSpawnMock();

    // Pre-populate the cache with a fresh token (5 min future expiry).
    const cachePath = cachePathFor('team_dummy', PREVIEW_ALIAS);
    await mkdir(join(globalConfigRef.dir, 'cache', 'traces'), {
      recursive: true,
    });
    await writeFile(
      cachePath,
      JSON.stringify({
        token: 'pre-cached-token',
        expiresAt: Date.now() + 5 * 60 * 1000,
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      }),
      { mode: 0o600 }
    );

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);
    expect(exitCode).toEqual(0);

    // Zero session API calls
    expect(captured.calls).toBe(0);

    // Curl was invoked with the cached token
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain(
      `Cookie: _vercel_tracing=pre-cached-token; _vercel_session=${USER_ID}`
    );
  });

  it('cache expired: re-issues when expiresAt is within 30s buffer', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);
    installSpawnMock();

    // Pre-populate the cache with a token that's about to expire.
    const cachePath = cachePathFor('team_dummy', PREVIEW_ALIAS);
    await mkdir(join(globalConfigRef.dir, 'cache', 'traces'), {
      recursive: true,
    });
    await writeFile(
      cachePath,
      JSON.stringify({
        token: 'almost-expired',
        expiresAt: Date.now() + 10 * 1000, // 10s in the future, within 30s buffer
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      }),
      { mode: 0o600 }
    );

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);
    expect(exitCode).toEqual(0);

    // API was called to re-issue
    expect(captured.calls).toBe(1);

    // Curl got the fresh token
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain(
      `Cookie: _vercel_tracing=${TRACE_TOKEN}; _vercel_session=${USER_ID}`
    );

    // Cache was overwritten with the fresh token
    const written = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(written.token).toBe(TRACE_TOKEN);
  });

  it('401 with cached cookie: evicts cache, re-issues, and retries curl once', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured, [REFRESHED_TOKEN]);

    // First curl returns 401, second returns 200
    installSpawnMock([{ status: 401 }, { status: 200 }]);

    // Pre-populate cache so the first attempt is "from cache".
    const cachePath = cachePathFor('team_dummy', PREVIEW_ALIAS);
    await mkdir(join(globalConfigRef.dir, 'cache', 'traces'), {
      recursive: true,
    });
    await writeFile(
      cachePath,
      JSON.stringify({
        token: 'stale-cached-token',
        expiresAt: Date.now() + 5 * 60 * 1000,
        deploymentId: DEPLOYMENT_ID,
        schemaVersion: 1,
      }),
      { mode: 0o600 }
    );

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);
    expect(exitCode).toEqual(0);

    // Session API was called exactly once (to refresh after eviction)
    expect(captured.calls).toBe(1);

    // Curl was invoked twice: first with stale, then with refreshed token
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0][1]).toContain(
      `Cookie: _vercel_tracing=stale-cached-token; _vercel_session=${USER_ID}`
    );
    expect(spawnMock.mock.calls[1][1]).toContain(
      `Cookie: _vercel_tracing=${REFRESHED_TOKEN}; _vercel_session=${USER_ID}`
    );

    // Cache now holds the refreshed token
    const written = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(written.token).toBe(REFRESHED_TOKEN);
  });

  it('401 with freshly-issued token: surfaces without retry', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = {
      value: undefined as unknown,
      query: undefined as Record<string, unknown> | undefined,
      calls: 0,
    };
    mockSessionEndpoint(captured);

    // Cache miss → fresh token → still 401 (real auth failure, not a stale
    // cookie). Trace should NOT retry — that's an infinite-loop hazard.
    installSpawnMock({ status: 401, xVercelId: X_VERCEL_ID });

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    await curl(client);

    // Only the single session API call and a single curl invocation.
    expect(captured.calls).toBe(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('missing authConfig.userId: falls back to /v2/user and still sets the session cookie', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    mockSessionEndpoint({ value: undefined, calls: 0 });
    installSpawnMock();

    // Mirror an authenticated CLI where the userId hasn't been cached yet —
    // the trace flow must call /v2/user to recover it.
    client.authConfig.userId = undefined;

    client.setArgv(
      'curl',
      '--trace',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await curl(client);
    expect(exitCode).toEqual(0);

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain(
      `Cookie: _vercel_tracing=${TRACE_TOKEN}; _vercel_session=${USER_ID}`
    );
  });
});
