import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'fs';
import { Readable } from 'stream';
import { client } from '../../../mocks/client';
import curl from '../../../../src/commands/curl';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const PROD_ALIAS = 'static-project-prod.vercel.app';
const PREVIEW_ALIAS = 'static-project-abc123.vercel.app';
const DEPLOYMENT_ID = 'dpl_test_abc123';
const TRACE_TOKEN = 'jwt-trace-token-deadbeef';
const X_VERCEL_ID = 'sfo1::abc-1234567890-deadbeef';

let spawnMock: ReturnType<typeof vi.fn>;

/**
 * Mock implementation of `spawn` that emulates curl writing the response
 * headers to the path supplied via `--dump-header <path>`. Body, when curl's
 * stdout is piped (i.e. our --json mode), is fed from `bodyText`.
 */
function installSpawnMock({
  bodyText = '',
  xVercelId = X_VERCEL_ID,
  exitCode = 0,
}: {
  bodyText?: string;
  xVercelId?: string | null;
  exitCode?: number;
} = {}) {
  spawnMock.mockImplementation((_cmd: string, args: string[], opts: any) => {
    const dumpIdx = args.indexOf('--dump-header');
    const headerPath = dumpIdx !== -1 ? args[dumpIdx + 1] : undefined;

    if (headerPath) {
      const lines = ['HTTP/1.1 200 OK', 'content-type: application/json'];
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
  capturedBody: { value: unknown },
  responseToken: string = TRACE_TOKEN
) {
  client.scenario.post('/v1/projects/traces/session', (req, res) => {
    capturedBody.value = req.body;
    res.json({ token: responseToken });
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

  useUser();
  useTeams('team_dummy');
  useProject({
    id: 'static',
    name: 'static-project',
    targets: productionAlias
      ? ({ production: { alias: [productionAlias] } } as any)
      : undefined,
    latestDeployments: [{ url: PREVIEW_ALIAS }],
  });
}

describe('curl --trace', () => {
  beforeEach(async () => {
    client.reset();
    client.stdin.isTTY = true;
    const childProcess = await import('child_process');
    spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('preview happy path: body to stdout, two stderr lines, request id from x-vercel-id', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    const captured = { value: undefined as unknown };
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

    // Cookie API was called with the right body
    expect(captured.value).toEqual({
      teamId: 'team_dummy',
      projectId: 'static',
      deploymentId: DEPLOYMENT_ID,
    });

    // spawn was invoked with --header Cookie: _vercel_tracing=<token>
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--header');
    expect(args).toContain(`Cookie: _vercel_tracing=${TRACE_TOKEN}`);
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
    const captured = { value: undefined as unknown };
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
    const captured = { value: undefined as unknown };
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
    const captured = { value: undefined as unknown };
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
      teamId: 'team_dummy',
      projectId: 'static',
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it('user-supplied Cookie after -- is preserved alongside injected tracing cookie', async () => {
    await setupLinkedProject();
    mockDeploymentLookup({ target: null });
    mockSessionEndpoint({ value: undefined });
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
    // Our injected cookie header
    expect(args).toContain(`Cookie: _vercel_tracing=${TRACE_TOKEN}`);
    // User's cookie header still in place (curl natively merges multi-Cookie headers)
    expect(args).toContain('Cookie: session=user-supplied');
  });
});
