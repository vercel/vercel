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

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

function installEngines(...names: string[]) {
  mockedWhichSync.mockImplementation(((name: string) =>
    names.includes(name) ? `/usr/bin/${name}` : null) as any);
}

/**
 * push captures stderr, so the mocked execa must return a thenable subprocess
 * that also exposes a pipeable `stderr` stream.
 */
function mockPushResult(result: { exitCode: number; stderr: string }) {
  mockedExeca.mockImplementation((() => {
    const subprocess: any = Promise.resolve(result);
    subprocess.stderr = { pipe: vi.fn() };
    return subprocess;
  }) as any);
}

describe('vcr push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    installEngines('docker', 'podman', 'buildah');
    mockPushResult({ exitCode: 0, stderr: '' });
    tmpDir = setupTmpDir('vercel-vcr-push');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VERCEL_VCR_REGISTRY;
  });

  describe('--help', () => {
    it('tracks telemetry and exits 2', async () => {
      client.setArgv('vcr', 'push', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:push',
        },
      ]);
    });
  });

  it('pushes with defaults', async () => {
    client.setArgv('vcr', 'push', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      ['push', 'vcr.vercel.com/my-team/vcr-project/vcr-project:latest'],
      { cwd: tmpDir, stdio: ['inherit', 'inherit', 'pipe'], reject: false }
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Pushed vcr.vercel.com/my-team/vcr-project/vcr-project:latest'
    );
  });

  it('pushes with zstd compression on podman', async () => {
    client.setArgv('vcr', 'push', 'podman');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'podman',
      [
        'push',
        '--compression-format',
        'zstd',
        '--compression-level',
        '3',
        'vcr.vercel.com/my-team/vcr-project/vcr-project:latest',
      ],
      { cwd: tmpDir, stdio: ['inherit', 'inherit', 'pipe'], reject: false }
    );
  });

  it('does not add compression flags on docker', async () => {
    client.setArgv('vcr', 'push', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const args = mockedExeca.mock.calls[0][1] as string[];
    expect(args).not.toContain('--compression-format');
  });

  it('pushes a specific name:tag', async () => {
    client.setArgv('vcr', 'push', 'docker', 'my-api:1.2.3');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      ['push', 'vcr.vercel.com/my-team/vcr-project/my-api:1.2.3'],
      { cwd: tmpDir, stdio: ['inherit', 'inherit', 'pipe'], reject: false }
    );
  });

  it('forwards passthrough args', async () => {
    client.setArgv('vcr', 'push', 'docker', '--', '--quiet');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      [
        'push',
        '--quiet',
        'vcr.vercel.com/my-team/vcr-project/vcr-project:latest',
      ],
      { cwd: tmpDir, stdio: ['inherit', 'inherit', 'pipe'], reject: false }
    );
  });

  it('hints to re-login on an auth failure', async () => {
    mockPushResult({
      exitCode: 1,
      stderr: 'Error response from daemon: unauthorized: access denied',
    });
    client.setArgv('vcr', 'push', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('was rejected');
  });

  it('surfaces an unexpected engine failure', async () => {
    mockPushResult({
      exitCode: 125,
      stderr: 'Cannot connect to the Docker daemon',
    });
    client.setArgv('vcr', 'push', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Cannot connect');
  });

  it('tracks subcommand and engine telemetry', async () => {
    client.setArgv('vcr', 'push', 'podman');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:push',
        value: 'push',
      },
      {
        key: 'argument:engine',
        value: 'podman',
      },
    ]);
  });
});
