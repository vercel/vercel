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

function installEngines(...names: string[]) {
  mockedWhichSync.mockImplementation(((name: string) =>
    names.includes(name) ? `/usr/bin/${name}` : null) as any);
}

describe('vcr build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    installEngines('docker', 'podman', 'buildah');
    mockedExeca.mockResolvedValue({ exitCode: 0, stderr: '' } as any);
    tmpDir = setupTmpDir('vercel-vcr-build');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VERCEL_VCR_REGISTRY;
  });

  describe('--help', () => {
    it('tracks telemetry and exits 2', async () => {
      client.setArgv('vcr', 'build', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:build',
        },
      ]);
    });
  });

  it.each([
    'docker',
    'podman',
    'buildah',
  ])('builds with the %s engine using defaults', async engine => {
    client.setArgv('vcr', 'build', engine);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      engine,
      [
        'build',
        '--platform',
        'linux/amd64',
        '--tag',
        'vcr.vercel.com/my-team/vcr-project/vcr-project:latest',
        '.',
      ],
      { cwd: tmpDir, stdio: 'inherit', reject: false }
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Built vcr.vercel.com/my-team/vcr-project/vcr-project:latest'
    );
  });

  it('uses an explicit path and name:tag', async () => {
    client.setArgv('vcr', 'build', 'docker', './app', 'my-api:1.2.3');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      [
        'build',
        '--platform',
        'linux/amd64',
        '--tag',
        'vcr.vercel.com/my-team/vcr-project/my-api:1.2.3',
        './app',
      ],
      { cwd: tmpDir, stdio: 'inherit', reject: false }
    );
  });

  it('honors the --platform override', async () => {
    client.setArgv('vcr', 'build', 'docker', '--platform', 'linux/arm64');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--platform', 'linux/arm64']),
      expect.anything()
    );
  });

  it('forwards passthrough args before the context path', async () => {
    client.setArgv(
      'vcr',
      'build',
      'docker',
      '.',
      '--',
      '--no-cache',
      '--build-arg',
      'K=V'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      [
        'build',
        '--platform',
        'linux/amd64',
        '--tag',
        'vcr.vercel.com/my-team/vcr-project/vcr-project:latest',
        '--no-cache',
        '--build-arg',
        'K=V',
        '.',
      ],
      { cwd: tmpDir, stdio: 'inherit', reject: false }
    );
  });

  it('errors when the engine argument is omitted', async () => {
    client.setArgv('vcr', 'build');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing engine');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('rejects an invalid engine value', async () => {
    client.setArgv('vcr', 'build', 'nope');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('docker, podman, buildah');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('errors when the requested engine is not installed', async () => {
    installEngines('podman');
    client.setArgv('vcr', 'build', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('PATH');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('errors when no project is linked and --project is omitted', async () => {
    mockNotLinked();
    client.setArgv('vcr', 'build', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project');
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('rejects an invalid repository name without invoking the engine', async () => {
    client.setArgv('vcr', 'build', 'docker', '.', 'Bad/Name');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('surfaces an engine failure with its exit code', async () => {
    mockedExeca.mockResolvedValue({ exitCode: 42, stderr: '' } as any);
    client.setArgv('vcr', 'build', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('42');
  });

  it('honors the VERCEL_VCR_REGISTRY override', async () => {
    process.env.VERCEL_VCR_REGISTRY = 'vcr.staging.vercel.com';
    client.setArgv('vcr', 'build', 'docker');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining([
        '--tag',
        'vcr.staging.vercel.com/my-team/vcr-project/vcr-project:latest',
      ]),
      expect.anything()
    );
  });

  it('tracks subcommand and engine telemetry', async () => {
    client.setArgv('vcr', 'build', 'podman');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:build',
        value: 'build',
      },
      {
        key: 'argument:engine',
        value: 'podman',
      },
    ]);
  });

  describe('--push', () => {
    const REF = 'vcr.vercel.com/my-team/vcr-project/vcr-project:latest';

    it('uses the Buildx build+push path with zstd when Buildx is available', async () => {
      // Default mock returns exitCode 0 for the `docker buildx version` probe.
      client.setArgv('vcr', 'build', 'docker', '--push');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(0);
      expect(mockedExeca).toHaveBeenCalledWith(
        'docker',
        [
          'buildx',
          'build',
          '--platform',
          'linux/amd64',
          '--output',
          `type=image,name=${REF},push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true`,
          '.',
        ],
        { cwd: tmpDir, stdio: ['inherit', 'inherit', 'pipe'], reject: false }
      );
      expect(client.stderr.getFullOutput()).toContain(
        `Built and pushed ${REF} (zstd compression)`
      );
    });

    it('falls back to a plain build and push (no compression) when Buildx is missing', async () => {
      mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
        if (args[0] === 'buildx' && args[1] === 'version') {
          return Promise.resolve({ exitCode: 1 });
        }
        const subprocess: any = Promise.resolve({ exitCode: 0, stderr: '' });
        subprocess.stderr = { pipe: vi.fn() };
        return subprocess;
      }) as any);

      client.setArgv('vcr', 'build', 'docker', '--push');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('Docker Buildx is not');
      expect(mockedExeca).toHaveBeenCalledWith(
        'docker',
        ['build', '--platform', 'linux/amd64', '--tag', REF, '.'],
        { cwd: tmpDir, stdio: 'inherit', reject: false }
      );
      expect(mockedExeca).toHaveBeenCalledWith('docker', ['push', REF], {
        cwd: tmpDir,
        stdio: ['inherit', 'inherit', 'pipe'],
        reject: false,
      });
    });

    it('builds then pushes with zstd compression on podman', async () => {
      client.setArgv('vcr', 'build', 'podman', '--push');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(0);
      expect(mockedExeca).toHaveBeenCalledWith(
        'podman',
        ['build', '--platform', 'linux/amd64', '--tag', REF, '.'],
        { cwd: tmpDir, stdio: 'inherit', reject: false }
      );
      expect(mockedExeca).toHaveBeenCalledWith(
        'podman',
        [
          'push',
          '--compression-format',
          'zstd',
          '--compression-level',
          '3',
          REF,
        ],
        { cwd: tmpDir, stdio: ['inherit', 'inherit', 'pipe'], reject: false }
      );
      expect(client.stderr.getFullOutput()).toContain(
        `Built and pushed ${REF} (zstd compression)`
      );
    });

    it('hints to re-login when the fused push is rejected', async () => {
      mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
        if (args[0] === 'buildx' && args[1] === 'version') {
          return Promise.resolve({ exitCode: 0 });
        }
        const subprocess: any = Promise.resolve({
          exitCode: 1,
          stderr: 'unauthorized: access denied',
        });
        subprocess.stderr = { pipe: vi.fn() };
        return subprocess;
      }) as any);

      client.setArgv('vcr', 'build', 'docker', '--push');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('was rejected');
    });

    it('does not misreport a build-step failure as an auth failure', async () => {
      // The fused Buildx build+push emits the whole build log on stderr; a
      // failing RUN step that mentions "permission denied" must not be read as
      // a registry credential rejection.
      mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
        if (args[0] === 'buildx' && args[1] === 'version') {
          return Promise.resolve({ exitCode: 0 });
        }
        const subprocess: any = Promise.resolve({
          exitCode: 1,
          stderr: 'RUN apt-get update\n/bin/sh: permission denied',
        });
        subprocess.stderr = { pipe: vi.fn() };
        return subprocess;
      }) as any);

      client.setArgv('vcr', 'build', 'docker', '--push');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).not.toContain('was rejected');
      expect(stderr).toContain('failed (exit code 1)');
    });

    it('tracks the push flag telemetry', async () => {
      client.setArgv('vcr', 'build', 'docker', '--push');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:build',
          value: 'build',
        },
        {
          key: 'argument:engine',
          value: 'docker',
        },
        {
          key: 'flag:push',
          value: 'TRUE',
        },
      ]);
    });
  });
});
