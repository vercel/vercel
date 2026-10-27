import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleRegistryBuildParams } from '../src/buildpacks/lifecycle/lifecycle';
import {
  buildAndPushWithLifecycleDocker,
  localBuildImageDockerfile,
  localBuildImageTag,
} from '../src/buildpacks/lifecycle/docker';
import type { BuildpackRuntime } from '../src/buildpacks/registry';
import { TARGET_PLATFORM } from '../src/engines/types';

const { runMock, fetchDistributionMock, rmSyncMock, debugMock } = vi.hoisted(
  () => ({
    runMock: vi.fn<typeof import('../src/util').run>(),
    fetchDistributionMock:
      vi.fn<
        typeof import('../src/buildpacks/lifecycle/lifecycle').fetchDistribution
      >(),
    rmSyncMock: vi.fn<typeof import('node:fs').rmSync>(),
    debugMock: vi.fn(),
  })
);

vi.mock('../src/util', async importActual => {
  const actual = await importActual<typeof import('../src/util')>();
  return {
    ...actual,
    run: runMock,
    debug: debugMock,
    step: vi.fn(),
    done: vi.fn(),
  };
});

vi.mock('../src/buildpacks/lifecycle/lifecycle', async importActual => {
  const actual =
    await importActual<
      typeof import('../src/buildpacks/lifecycle/lifecycle')
    >();
  return {
    ...actual,
    fetchDistribution: fetchDistributionMock,
    stageWorkspace: () => {
      throw new Error('The Docker runner must use the prepared source.');
    },
  };
});

vi.mock('node:fs', async importActual => {
  const actual = await importActual<typeof import('node:fs')>();
  return {
    ...actual,
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      rmSyncMock(...args);
      actual.rmSync(...args);
    },
  };
});

const digest = `sha256:${'a'.repeat(64)}`;
const buildImageId = `sha256:${'b'.repeat(64)}`;
const buildImage = 'docker.io/library/ruby:3.4.9-bookworm';
const buildpack: BuildpackRuntime = {
  runtime: 'ruby',
  projectMarkers: ['Gemfile'],
  buildpacks: [],
  resolveImage: async () => ({
    version: '3.4.9',
    buildImage,
    runImage: buildImage,
  }),
};

describe('Docker lifecycle storage', () => {
  let testDir: string;
  let params: LifecycleRegistryBuildParams;
  let report: string;
  let imageIds: (string | undefined)[];
  let failCommand: ((args: string[]) => boolean) | undefined;
  let commandError: Error;
  let failDockerCleanup: boolean;
  const stageDirs = new Set<string>();
  const copiedEnv: Record<string, string>[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    rmSyncMock.mockReset();
    stageDirs.clear();
    copiedEnv.length = 0;
    testDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-docker-test-'));
    const workPath = join(testDir, 'prepared source');
    mkdirSync(workPath, { mode: 0o750 });
    writeFileSync(join(workPath, 'app.rb'), 'puts "prepared source"\n', {
      mode: 0o640,
    });
    symlinkSync('/etc/passwd', join(workPath, 'system-link'));
    params = {
      workPath,
      image: { version: '3.4.9', buildImage, runImage: buildImage },
      imageRef: 'registry.example.com/project/app:build',
      credentials: {
        registry: 'registry.example.com',
        username: 'test-user',
        token: 'registry-secret',
      },
      nodeToolchain: { major: 22, version: '22.x', home: '/node22' },
      buildEnv: {
        SECRET: 'project-secret',
        VERCEL_COMMAND: '["do-not-forward"]',
        VERCEL_ENTRYPOINT: 'do-not-forward',
        VERCEL_NODE_HOME: '/host/node',
      },
    };
    report = `[image]\ndigest = "${digest}"\n`;
    imageIds = [`${buildImageId}\n`];
    failCommand = undefined;
    commandError = new Error('command failed');
    failDockerCleanup = false;
    fetchDistributionMock.mockImplementation(async (_buildpack, cnbDir) => {
      stageDirs.add(dirname(cnbDir));
      mkdirSync(join(cnbDir, 'lifecycle'));
      writeFileSync(join(cnbDir, 'lifecycle', 'creator'), 'mock creator', {
        mode: 0o755,
      });
    });
    runMock.mockImplementation(async (cmd, args) => {
      expect(cmd).toBe('docker');
      if (args[0] === 'rm' && failDockerCleanup) {
        throw new Error('Docker cleanup failed');
      }
      if (failCommand?.(args)) {
        throw commandError;
      }
      if (args[0] === 'build') {
        const imageId = imageIds.length > 1 ? imageIds.shift() : imageIds[0];
        if (imageId !== undefined) {
          writeFileSync(args[args.indexOf('--iidfile') + 1], imageId);
        }
      }
      if (args[0] === 'cp' && args[2].endsWith(':/platform/env')) {
        copiedEnv.push(
          Object.fromEntries(
            readdirSync(args[1]).map(name => [
              name,
              readFileSync(join(args[1], name), 'utf8'),
            ])
          )
        );
      }
      if (
        args[0] === 'cp' &&
        args[1].endsWith(':/platform-output/report.toml')
      ) {
        writeFileSync(args[2], report);
      }
      return { stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    rmSyncMock.mockReset();
    for (const dir of stageDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    rmSync(testDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('initializes source and metadata ownership in engine volumes and retrieves the report before teardown', async () => {
    vi.stubEnv('VERCEL_COMMAND', 'host-command-must-not-be-forwarded');
    const sourceStat = statSync(join(params.workPath, 'app.rb'));
    const workspaceStat = statSync(params.workPath);
    const symlinkTarget = readlinkSync(join(params.workPath, 'system-link'));
    const result = await buildAndPushWithLifecycleDocker(buildpack, params);
    expect(result).toEqual({
      imageRef: params.imageRef,
      digest,
      buildImage,
      runImage: buildImage,
      runtimeVersion: params.image.version,
    });

    const calls = runMock.mock.calls;
    const commands = calls.map(([, args]) => args);
    const initName = commands[1][commands[1].indexOf('--name') + 1];
    const creatorName = commands[7][commands[7].indexOf('--name') + 1];
    const [stageDir] = stageDirs;
    expect(initName).toBe(`${creatorName}-init`);
    expect(creatorName).toMatch(/^vercel-cnb-ruby-\d+-[a-f0-9]{16}$/);

    const dockerfile = localBuildImageDockerfile(buildImage, 22);
    const tag = localBuildImageTag(dockerfile);
    expect(commands).toEqual([
      [
        'build',
        '--pull',
        '--platform',
        TARGET_PLATFORM,
        '--tag',
        tag,
        '--iidfile',
        join(stageDir, 'build-image.id'),
        '-',
      ],
      [
        'create',
        '--name',
        initName,
        '--platform',
        TARGET_PLATFORM,
        '--user',
        '0:0',
        '--network',
        'none',
        '--volume',
        '/workspace',
        '--volume',
        '/layers',
        '--volume',
        '/platform-output',
        '--volume',
        '/cnb',
        '--volume',
        '/platform',
        '--entrypoint',
        '/bin/sh',
        buildImageId,
        '-c',
        'chown -R -h 1001:1001 /workspace /layers /platform-output ' +
          '&& chown -R -h 0:0 /cnb /platform',
      ],
      ['cp', `${params.workPath}/.`, `${initName}:/workspace`],
      ['cp', `${join(stageDir, 'cnb')}/.`, `${initName}:/cnb`],
      [
        'cp',
        expect.stringContaining(join(stageDir, 'vercel-cnb-order-')),
        `${initName}:/platform/order`,
      ],
      [
        'cp',
        expect.stringContaining(join(stageDir, 'vercel-cnb-env-')),
        `${initName}:/platform/env`,
      ],
      ['start', '--attach', initName],
      [
        'create',
        '--name',
        creatorName,
        '--platform',
        TARGET_PLATFORM,
        '--user',
        '1001:1001',
        '--env',
        'HOME=/home/cnb',
        '--env',
        'CNB_USER_ID=1001',
        '--env',
        'CNB_GROUP_ID=1001',
        '--env',
        'CNB_PLATFORM_API=0.15',
        '--env',
        'CNB_REGISTRY_AUTH',
        '--volumes-from',
        initName,
        '--entrypoint',
        '/cnb/lifecycle/creator',
        buildImageId,
        '-app=/workspace',
        '-order=/platform/order/order.toml',
        '-skip-restore',
        `-run-image=${buildImage}`,
        '-report=/platform-output/report.toml',
        params.imageRef,
      ],
      ['start', '--attach', creatorName],
      [
        'cp',
        `${creatorName}:/platform-output/report.toml`,
        join(stageDir, 'report.toml'),
      ],
      ['rm', '--force', '--volumes', creatorName],
      ['rm', '--force', '--volumes', initName],
    ]);

    expect(calls[0][2]).toEqual({ input: dockerfile });
    expect(dockerfile).toContain(
      'FROM docker.io/library/node:22-bookworm-slim AS node\n'
    );
    expect(dockerfile).toContain(`FROM ${buildImage}\n`);
    expect(dockerfile).toContain('COPY --from=node /usr/local /node22\n');
    expect(dockerfile).toContain(
      'chown -R 1001:1001 /layers /workspace /home/cnb'
    );
    expect(dockerfile).not.toContain(params.workPath);
    expect(dockerfile).not.toContain(buildImageId);
    expect(copiedEnv).toEqual([
      { SECRET: 'project-secret', VERCEL_NODE_HOME: '/node22' },
    ]);
    expect(params.buildEnv?.VERCEL_COMMAND).toBe('["do-not-forward"]');

    const auth = JSON.stringify({
      'registry.example.com': `Basic ${Buffer.from('test-user:registry-secret').toString('base64')}`,
    });
    expect(calls[7][2]?.env?.CNB_REGISTRY_AUTH).toBe(auth);
    for (const output of [
      JSON.stringify(commands),
      JSON.stringify(debugMock.mock.calls),
      dockerfile,
    ]) {
      expect(output).not.toContain(auth);
      expect(output).not.toContain('registry-secret');
      expect(output).not.toContain('project-secret');
      expect(output).not.toContain('VERCEL_COMMAND');
    }
    expect(readFileSync(join(params.workPath, 'app.rb'), 'utf8')).toBe(
      'puts "prepared source"\n'
    );
    expect(statSync(join(params.workPath, 'app.rb'))).toMatchObject({
      mode: sourceStat.mode,
      uid: sourceStat.uid,
      gid: sourceStat.gid,
    });
    expect(statSync(params.workPath)).toMatchObject({
      mode: workspaceStat.mode,
      uid: workspaceStat.uid,
      gid: workspaceStat.gid,
    });
    expect(readlinkSync(join(params.workPath, 'system-link'))).toBe(
      symlinkTarget
    );
    expect(readdirSync(params.workPath).sort()).toEqual([
      'app.rb',
      'system-link',
    ]);
    expect(existsSync(stageDir)).toBe(false);
  });

  it("passes the platform's entrypoint and command, never the project's", async () => {
    await buildAndPushWithLifecycleDocker(buildpack, {
      ...params,
      entrypoint: 'cmd/worker',
      command: ['worker', '--queue=emails'],
    });
    expect(copiedEnv).toEqual([
      {
        SECRET: 'project-secret',
        VERCEL_NODE_HOME: '/node22',
        VERCEL_ENTRYPOINT: 'cmd/worker',
        VERCEL_COMMAND: '["worker","--queue=emails"]',
      },
    ]);
  });

  it.each([
    ['image build', 0, 0],
    ['initializer creation', 1, 1],
    ['source copy', 2, 1],
    ['CNB copy', 3, 1],
    ['order copy', 4, 1],
    ['platform env copy', 5, 1],
    ['initializer start', 6, 1],
    ['creator creation', 7, 2],
    ['lifecycle execution', 8, 2],
    ['report copy', 9, 2],
  ])('cleans up after %s fails, even when Docker cleanup also fails', async (_phase, failedIndex, containerCount) => {
    failCommand = () => runMock.mock.calls.length === failedIndex + 1;
    failDockerCleanup = true;
    if (failedIndex === 8) {
      commandError = Object.assign(new Error('primary lifecycle failure'), {
        exitCode: 51,
      });
    }
    await expect(
      buildAndPushWithLifecycleDocker(buildpack, params)
    ).rejects.toThrow(commandError.message);

    const commands = runMock.mock.calls.map(([, args]) => args);
    expect(commands).toHaveLength(failedIndex + 1 + containerCount);
    const createdNames = commands
      .filter(args => args[0] === 'create')
      .map(args => args[args.indexOf('--name') + 1]);
    expect(commands.filter(args => args[0] === 'rm')).toEqual(
      createdNames.reverse().map(name => ['rm', '--force', '--volumes', name])
    );
    expect(createdNames).toHaveLength(containerCount);
    for (const [, args, opts] of runMock.mock.calls) {
      if (args[0] === 'rm') {
        expect(opts).toEqual({ quiet: true });
      }
    }
    const [stageDir] = stageDirs;
    expect(existsSync(stageDir)).toBe(false);
    expect(existsSync(params.workPath)).toBe(true);
  });

  it.each([
    '',
    `sha256:${'b'.repeat(63)}`,
    `${buildImageId}\n${buildImageId}`,
    `ruby@${buildImageId}`,
  ])('rejects an invalid build image ID before creating containers: %s', async imageId => {
    imageIds = [imageId];
    await expect(
      buildAndPushWithLifecycleDocker(buildpack, params)
    ).rejects.toThrow('Docker build did not report a valid image ID.');
    expect(runMock).toHaveBeenCalledOnce();
    const [stageDir] = stageDirs;
    expect(existsSync(stageDir)).toBe(false);
  });

  it('cleans up when Docker does not write the image ID file', async () => {
    imageIds = [undefined];
    await expect(
      buildAndPushWithLifecycleDocker(buildpack, params)
    ).rejects.toThrow(/ENOENT.*build-image\.id/);
    expect(runMock).toHaveBeenCalledOnce();
    const [stageDir] = stageDirs;
    expect(existsSync(stageDir)).toBe(false);
  });

  it.each([
    'invalid = [',
    '[image]\ntags = ["no digest"]\n',
    '[image]\ndigest = "not-a-digest"\n',
  ])('cleans up after an invalid report: %s', async invalidReport => {
    report = invalidReport;
    await expect(
      buildAndPushWithLifecycleDocker(buildpack, params)
    ).rejects.toThrow('lifecycle did not report a digest');
    const commands = runMock.mock.calls.map(([, args]) => args);
    expect(commands.slice(-3).map(args => args[0])).toEqual(['cp', 'rm', 'rm']);
    const [stageDir] = stageDirs;
    expect(existsSync(stageDir)).toBe(false);
  });

  it('does not replace a successful result with Docker or host cleanup errors', async () => {
    failDockerCleanup = true;
    rmSyncMock.mockImplementation(() => {
      throw new Error('host cleanup failed');
    });
    await expect(
      buildAndPushWithLifecycleDocker(buildpack, params)
    ).resolves.toMatchObject({ digest });
    expect(runMock.mock.calls.slice(-2).map(([, args]) => args[0])).toEqual([
      'rm',
      'rm',
    ]);
    const [stageDir] = stageDirs;
    expect(rmSyncMock).toHaveBeenCalledWith(stageDir, {
      recursive: true,
      force: true,
    });
  });

  it('does not replace the lifecycle failure with a host cleanup error', async () => {
    failCommand = args => args[0] === 'start' && !args[2].endsWith('-init');
    commandError = Object.assign(new Error('primary lifecycle failure'), {
      exitCode: 51,
    });
    rmSyncMock.mockImplementation(() => {
      throw new Error('host cleanup failed');
    });
    await expect(
      buildAndPushWithLifecycleDocker(buildpack, params)
    ).rejects.toThrow(
      /The lifecycle exited with code 51:[\s\S]*Underlying error: primary lifecycle failure/
    );
    expect(runMock.mock.calls.slice(-2).map(([, args]) => args[0])).toEqual([
      'rm',
      'rm',
    ]);
    expect(rmSyncMock).toHaveBeenCalledOnce();
  });

  it('uses each concurrent build image ID for both containers even with the same cache tag', async () => {
    const otherImageId = `sha256:${'c'.repeat(64)}`;
    imageIds = [buildImageId, otherImageId];
    await Promise.all([
      buildAndPushWithLifecycleDocker(buildpack, params),
      buildAndPushWithLifecycleDocker(buildpack, params),
    ]);
    const commands = runMock.mock.calls.map(([, args]) => args);
    const names = commands
      .filter(args => args[0] === 'create')
      .map(args => args[args.indexOf('--name') + 1]);
    expect(new Set(names).size).toBe(4);
    expect(stageDirs.size).toBe(2);
    const builds = commands.filter(args => args[0] === 'build');
    expect(
      new Set(builds.map(args => args[args.indexOf('--tag') + 1])).size
    ).toBe(1);
    expect(
      new Set(builds.map(args => args[args.indexOf('--iidfile') + 1])).size
    ).toBe(2);
    const initImages = new Map(
      commands
        .filter(args => args[0] === 'create' && args.includes('/bin/sh'))
        .map(args => [
          args[args.indexOf('--name') + 1],
          args[args.indexOf('--entrypoint') + 2],
        ])
    );
    expect([...initImages.values()].sort()).toEqual([
      buildImageId,
      otherImageId,
    ]);
    for (const args of commands.filter(
      args => args[0] === 'create' && args.includes('--volumes-from')
    )) {
      expect(args[args.indexOf('--entrypoint') + 2]).toBe(
        initImages.get(args[args.indexOf('--volumes-from') + 1])
      );
    }
    expect(commands.filter(args => args[0] === 'rm')).toHaveLength(4);
    for (const dir of stageDirs) {
      expect(existsSync(dir)).toBe(false);
    }
  });
});
