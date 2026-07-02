import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import vcr from '../../../../src/commands/vcr';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import execa from 'execa';
import which from 'which';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('execa', () => ({ default: vi.fn() }));
vi.mock('which', () => ({ default: { sync: vi.fn() } }));

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedExeca = vi.mocked(execa);
const mockedWhichSync = vi.mocked(which.sync);

const TOKEN = 'header.payload.signature-oidc-secret';

let tmpDir: string;

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_vcr',
      name: 'vcr-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  } as any);
}

function mockNotLinked() {
  mockedGetLinkedProject.mockResolvedValue({ status: 'not_linked' } as any);
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

/** Stub the OIDC token mint endpoint (same one `vercel project token` uses). */
function mockMint(token = TOKEN) {
  client.scenario.post('/projects/prj_vcr/token', (_req, res) => {
    res.json({ token });
  });
}

/** Treat only the named engines as installed on PATH. */
function installEngines(...names: string[]) {
  mockedWhichSync.mockImplementation(((name: string) =>
    names.includes(name) ? `/usr/bin/${name}` : null) as any);
}

describe('vcr login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    installEngines('docker', 'podman', 'buildah');
    mockedExeca.mockResolvedValue({ exitCode: 0, stderr: '' } as any);
    tmpDir = setupTmpDir('vercel-vcr-login');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VERCEL_VCR_REGISTRY;
  });

  describe('--help', () => {
    it('tracks telemetry and exits 2', async () => {
      client.setArgv('vcr', 'login', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:login',
        },
      ]);
    });
  });

  it.each([
    'docker',
    'podman',
    'buildah',
  ])('logs in with the explicit %s engine', async engine => {
    mockMint();
    client.setArgv('vcr', 'login', engine);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      engine,
      ['login', 'vcr.vercel.com', '--username', 'oidc', '--password-stdin'],
      { input: TOKEN, reject: false }
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Logged in to vcr.vercel.com'
    );
    expect(client.stderr.getFullOutput()).toContain('valid for ~12 hours');
  });

  it('never leaks the token to stdout or stderr', async () => {
    mockMint();
    client.setArgv('vcr', 'login', 'docker');
    await vcr(client);
    expect(client.stdout.getFullOutput()).not.toContain(TOKEN);
    expect(client.stderr.getFullOutput()).not.toContain(TOKEN);
  });

  it('errors when the engine argument is omitted (no default)', async () => {
    client.setArgv('vcr', 'login');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing engine');
    expect(client.stderr.getFullOutput()).toContain('docker, podman, buildah');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('errors when the requested engine is not installed', async () => {
    installEngines('podman'); // docker missing
    client.setArgv('vcr', 'login', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('docker');
    expect(client.stderr.getFullOutput()).toContain('PATH');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('surfaces an authentication failure', async () => {
    mockMint();
    mockedExeca.mockResolvedValue({
      exitCode: 1,
      stderr: 'Error response from daemon: unauthorized: access denied',
    } as any);
    client.setArgv('vcr', 'login', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('was rejected');
  });

  it('surfaces an unexpected engine failure with stderr tail', async () => {
    mockMint();
    mockedExeca.mockResolvedValue({
      exitCode: 125,
      stderr: 'Cannot connect to the Docker daemon',
    } as any);
    client.setArgv('vcr', 'login', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Cannot connect');
  });

  it('errors when no project is linked and --project is omitted', async () => {
    mockNotLinked();
    client.setArgv('vcr', 'login', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('rejects an invalid engine value', async () => {
    client.setArgv('vcr', 'login', 'nope');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('docker, podman, buildah');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('emits token-free JSON with --format json', async () => {
    mockMint();
    client.setArgv('vcr', 'login', 'docker', '--format', 'json');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toMatchObject({
      status: 'success',
      engine: 'docker',
      registry: 'vcr.vercel.com',
      username: 'oidc',
      validForHours: 12,
    });
    expect(parsed).not.toHaveProperty('token');
    expect(client.stdout.getFullOutput()).not.toContain(TOKEN);
  });

  it('honors the VERCEL_VCR_REGISTRY override', async () => {
    process.env.VERCEL_VCR_REGISTRY = 'vcr.staging.vercel.com';
    mockMint();
    client.setArgv('vcr', 'login', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      [
        'login',
        'vcr.staging.vercel.com',
        '--username',
        'oidc',
        '--password-stdin',
      ],
      { input: TOKEN, reject: false }
    );
  });

  it('tracks subcommand and engine telemetry', async () => {
    mockMint();
    client.setArgv('vcr', 'login', 'podman');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:login',
        value: 'login',
      },
      {
        key: 'argument:engine',
        value: 'podman',
      },
    ]);
  });

  it('handles an API error while minting the token', async () => {
    client.scenario.post('/projects/prj_vcr/token', (_req, res) => {
      res.status(401).json({
        error: { code: 'forbidden', message: 'Not allowed.' },
      });
    });
    client.setArgv('vcr', 'login', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(mockedExeca).not.toHaveBeenCalled();
  });
});
