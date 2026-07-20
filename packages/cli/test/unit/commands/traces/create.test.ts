import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Redirect the trace-session-token-provider's on-disk cache into a tmpdir per
// test so we don't pollute the user's `~/.vercel`. `vi.hoisted` runs before
// `vi.mock` so the ref is set when the mock factory executes during hoisting.
const globalConfigRef = vi.hoisted(() => ({ dir: '' }));
vi.mock('../../../../src/util/config/global-path', () => ({
  default: () => globalConfigRef.dir,
}));

const PREVIEW_ALIAS = 'static-project-abc123.vercel.app';
const DEPLOYMENT_ID = 'dpl_test_abc123';
const TRACE_TOKEN = 'jwt-trace-token-deadbeef';
const X_VERCEL_ID = 'sfo1::abc-1234567890-deadbeef';
// The trace flow parses everything after the last `::` out of `x-vercel-id`.
const REQUEST_ID = 'abc-1234567890-deadbeef';
const USER_ID = 'u_test_user_abc';

let spawnMock: ReturnType<typeof vi.fn>;

interface SpawnResponse {
  status?: number;
  bodyText?: string;
  xVercelId?: string | null;
  exitCode?: number;
}

/**
 * Mock `spawn` that emulates curl writing response headers to the path passed
 * via `--dump-header <path>`, and streaming the body when stdout is piped
 * (our --json mode).
 */
function installSpawnMock(config: SpawnResponse = {}) {
  const {
    status = 200,
    bodyText = '',
    xVercelId = X_VERCEL_ID,
    exitCode = 0,
  } = config;

  spawnMock.mockImplementation((_cmd: string, args: string[], opts: any) => {
    const dumpIdx = args.indexOf('--dump-header');
    const headerPath = dumpIdx !== -1 ? args[dumpIdx + 1] : undefined;

    if (headerPath) {
      const reason = status === 200 ? 'OK' : 'Unauthorized';
      const lines = [
        `HTTP/1.1 ${status} ${reason}`,
        'content-type: text/plain',
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

function mockSessionEndpoint(captured?: {
  body?: unknown;
  query?: Record<string, unknown>;
}) {
  client.scenario.post('/v1/projects/traces/session', (req, res) => {
    if (captured) {
      captured.body = req.body;
      captured.query = req.query;
    }
    res.json({ token: TRACE_TOKEN, expiresAt: Date.now() + 5 * 60 * 1000 });
  });
}

function mockDeploymentLookup(target: 'production' | null = null) {
  client.scenario.get('/v13/deployments/:host', (_req, res) => {
    res.json({
      id: DEPLOYMENT_ID,
      url: `${DEPLOYMENT_ID}.vercel.app`,
      target,
      ownerId: 'team_dummy',
      projectId: 'static',
    });
  });
}

async function setupLinkedProject() {
  const { setupUnitFixture } = await import(
    '../../../helpers/setup-unit-fixture'
  );
  client.cwd = setupUnitFixture('commands/deploy/static');

  useUser({ id: USER_ID });
  useTeams('team_dummy');
  useProject({
    id: 'static',
    name: 'static-project',
    latestDeployments: [{ url: PREVIEW_ALIAS }],
  });
  client.authConfig.userId = USER_ID;
}

describe('traces create', () => {
  beforeEach(async () => {
    client.reset();
    client.stdin.isTTY = true;
    globalConfigRef.dir = mkdtempSync(join(tmpdir(), 'traces-create-config-'));
    const childProcess = await import('child_process');
    spawnMock = vi.mocked(childProcess.spawn);
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    rmSync(globalConfigRef.dir, { recursive: true, force: true });
  });

  describe('--help', () => {
    it('prints the create subcommand help', async () => {
      client.setArgv('traces', 'create', '--help');
      const exitCode = await traces(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'alias for `vercel curl --trace`'
      );
    });
  });

  describe('argument parsing', () => {
    it('rejects when no path is provided', async () => {
      client.setArgv('traces', 'create');
      const exitCode = await traces(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires a URL or API path');
    });
  });

  it('forces the trace flow and prints the follow-up command', async () => {
    await setupLinkedProject();
    mockDeploymentLookup();
    mockSessionEndpoint();
    installSpawnMock();

    client.setArgv(
      'traces',
      'create',
      '/api/hello',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await traces(client);

    expect(exitCode).toEqual(0);

    // The shared trace flow ran: curl was spawned with the session cookie and
    // the header dump, even though `--trace` was never passed explicitly.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--dump-header');
    expect(args).toContain(
      `Cookie: _vercel_tracing=${TRACE_TOKEN}; _vercel_session=${USER_ID}`
    );
    expect(args).toEqual(
      expect.arrayContaining(['--url', `https://${PREVIEW_ALIAS}/api/hello`])
    );

    expect(client.stderr.getFullOutput()).toContain(
      `Run \`vercel traces get ${REQUEST_ID}\` to fetch the trace.`
    );

    // The shared curl runner emits the path argument, the passed-through
    // --protection-bypass option, and the forced trace flag. (The
    // `traces`/`create` command attribution is emitted by the root dispatch,
    // which this direct-invocation test bypasses.)
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:path', value: 'slash' },
      { key: 'option:protection-bypass', value: '[REDACTED]' },
      { key: 'flag:trace', value: 'TRUE' },
    ]);
  });

  it('targets an explicit deployment from an unlinked directory', async () => {
    client.cwd = setupTmpDir();
    useUser({ id: USER_ID });
    useTeams('team_dummy');
    client.authConfig.userId = USER_ID;
    mockDeploymentLookup();
    const captured: {
      body?: unknown;
      query?: Record<string, unknown>;
    } = {};
    mockSessionEndpoint(captured);
    installSpawnMock();

    client.setArgv(
      'traces',
      'create',
      '/api/hello',
      '--deployment',
      `https://${PREVIEW_ALIAS}`,
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await traces(client);

    expect(exitCode).toEqual(0);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toEqual(
      expect.arrayContaining(['--url', `https://${PREVIEW_ALIAS}/api/hello`])
    );
    expect(captured.body).toEqual({
      projectId: 'static',
      hostname: PREVIEW_ALIAS,
    });
    expect(captured.query?.teamId).toBe('team_dummy');
  });

  it('traces against the explicit deployment project, not the linked project', async () => {
    await setupLinkedProject();
    client.scenario.get('/v13/deployments/:host', (_req, res) => {
      res.json({
        id: 'dpl_other',
        url: 'other-app.vercel.app',
        target: null,
        ownerId: 'team_other',
        projectId: 'other-project',
      });
    });
    const captured: {
      body?: unknown;
      query?: Record<string, unknown>;
    } = {};
    mockSessionEndpoint(captured);
    installSpawnMock();

    client.setArgv(
      'traces',
      'create',
      '/api/hello',
      '--deployment',
      'https://other-app.vercel.app',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await traces(client);

    expect(exitCode).toEqual(0);
    expect(captured.body).toEqual({
      projectId: 'other-project',
      hostname: 'other-app.vercel.app',
    });
    expect(captured.query?.teamId).toBe('team_other');
  });

  it('accepts global flags before traces create', async () => {
    client.cwd = setupTmpDir();
    useUser({ id: USER_ID });
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
    client.authConfig.userId = USER_ID;
    mockDeploymentLookup();
    mockSessionEndpoint();
    installSpawnMock();

    client.setArgv(
      '--scope',
      'my-team',
      'traces',
      'create',
      '/api/hello',
      '--deployment',
      `https://${PREVIEW_ALIAS}`,
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await traces(client);

    expect(exitCode).toEqual(0);
    const [, args] = spawnMock.mock.calls[0];
    expect(args).toEqual(
      expect.arrayContaining(['--url', `https://${PREVIEW_ALIAS}/api/hello`])
    );
    expect(args).not.toContain('--scope');
    expect(args).not.toContain('my-team');
  });

  it('emits a JSON envelope with --json', async () => {
    await setupLinkedProject();
    mockDeploymentLookup();
    mockSessionEndpoint();
    installSpawnMock({ bodyText: '{"hello":"world"}' });

    let stdoutBuf = '';
    vi.spyOn(client.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutBuf += chunk;
      return true;
    });

    client.setArgv(
      'traces',
      'create',
      '/api/hello',
      '--json',
      '--protection-bypass',
      'test-secret'
    );
    const exitCode = await traces(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.requestId).toBe(REQUEST_ID);
    expect(parsed.response).toBe('{"hello":"world"}');
  });
});
