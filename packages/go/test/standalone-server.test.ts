import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirp, remove, writeFile } from 'fs-extra';
import type { BuildOptions } from '@vercel/build-utils';

vi.mock('@vercel/build-utils', () => ({
  debug: vi.fn(),
  cloneEnv: (...envs: (NodeJS.ProcessEnv | undefined)[]) =>
    Object.assign({}, ...envs),
  glob: vi.fn(async () => ({})),
  download: vi.fn(),
  getWriteableDirectory: vi.fn(async () => '/fake/out'),
  getLambdaOptionsFromFunction: vi.fn(async () => undefined),
  execCommand: vi.fn(),
  getReportedServiceType: vi.fn(),
}));

vi.mock('@vercel-internals/ipc-proxy', () => ({
  createStandaloneLambda: vi.fn(async () => ({ type: 'Lambda' })),
  startDevProxy: vi.fn(),
}));

// Use real module/workspace discovery.
vi.mock('../src/go-helpers', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/go-helpers')>();
  return {
    ...actual,
    createGo: vi.fn(),
    findGoBinary: vi.fn(),
  };
});

vi.mock('../src/diagnostics', () => ({
  generateProjectManifest: vi.fn(async () => {}),
}));

import { createGo } from '../src/go-helpers';
import { buildStandaloneServer } from '../src/standalone-server';

const repo = join(tmpdir(), 'vercel-go-test-standalone-server');
const serviceRoot = join(repo, 'services', 'api');
const entrypoint = join('cmd', 'server', 'main.go');

function fakeGo(versionSource: unknown) {
  return {
    build: vi.fn(async () => {}),
    getEnv: () => ({ PATH: '/fake/go/bin' }),
    modEditJson: vi.fn(async () => null),
    resolvedVersion: '1.27.0',
    versionSource,
  } as unknown as Awaited<ReturnType<typeof createGo>>;
}

function buildOptions(overrides: Partial<BuildOptions> = {}): BuildOptions {
  return {
    files: {},
    entrypoint,
    workPath: serviceRoot,
    repoRootPath: repo,
    config: { framework: 'go' },
    meta: { skipDownload: true },
    service: { name: 'api', workspace: 'services/api' },
    ...overrides,
  } as BuildOptions;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('GOWORK', undefined);
  await mkdirp(join(serviceRoot, 'cmd', 'server'));
  await writeFile(join(serviceRoot, entrypoint), 'package main\n');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await remove(repo);
});

describe('buildStandaloneServer', () => {
  it('resolves a go.mod shared from the repo root above the service root', async () => {
    await writeFile(
      join(repo, 'go.mod'),
      'module example.com/repo\n\ngo 1.27.0\n'
    );
    vi.mocked(createGo).mockResolvedValue(
      fakeGo({ kind: 'go.mod', file: join(repo, 'go.mod'), directive: 'go' })
    );

    await buildStandaloneServer(buildOptions());

    expect(createGo).toHaveBeenCalledWith({
      modulePath: repo,
      workspaceFile: undefined,
      workPath: serviceRoot,
      opts: expect.objectContaining({ cwd: serviceRoot }),
    });
    expect(console.log).toHaveBeenCalledWith('Using Go 1.27.0 (from go.mod)');
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Warning')
    );
  });

  it('prefers a go.mod inside the service root over one at the repo root', async () => {
    await writeFile(
      join(repo, 'go.mod'),
      'module example.com/repo\n\ngo 1.27.0\n'
    );
    await writeFile(
      join(serviceRoot, 'go.mod'),
      'module example.com/api\n\ngo 1.26.0\n'
    );
    vi.mocked(createGo).mockResolvedValue(
      fakeGo({
        kind: 'go.mod',
        file: join(serviceRoot, 'go.mod'),
        directive: 'go',
      })
    );

    await buildStandaloneServer(buildOptions());

    expect(createGo).toHaveBeenCalledWith(
      expect.objectContaining({
        modulePath: serviceRoot,
        workPath: serviceRoot,
      })
    );
    expect(console.log).toHaveBeenCalledWith(
      'Using Go 1.27.0 (from services/api/go.mod)'
    );
  });

  it.each([
    [undefined, 'go.work'],
    ['', 'go.work'],
    ['auto', 'go.work'],
    ['off', undefined],
    [join(repo, 'ci.work'), 'ci.work'],
  ])('resolves the active workspace with GOWORK=%s', async (goWork, filename) => {
    await writeFile(
      join(repo, 'go.mod'),
      'module example.com/repo\n\ngo 1.27.0\n'
    );
    await writeFile(join(repo, 'go.work'), 'go 1.27.0\n\nuse .\n');
    await writeFile(join(repo, 'ci.work'), 'go 1.27.0\n\nuse .\n');
    // Go searches from its cwd, not from the entrypoint's directory.
    await writeFile(
      join(serviceRoot, 'cmd', 'server', 'go.work'),
      'go 1.26.0\n'
    );
    const workspaceFile = filename ? join(repo, filename) : undefined;
    vi.mocked(createGo).mockResolvedValue(
      fakeGo({
        kind: workspaceFile ? 'go.work' : 'go.mod',
        file: workspaceFile ?? join(repo, 'go.mod'),
        directive: 'go',
      })
    );

    await buildStandaloneServer(
      buildOptions({ meta: { skipDownload: true, env: { GOWORK: goWork } } })
    );

    expect(createGo).toHaveBeenCalledWith(
      expect.objectContaining({ modulePath: repo, workspaceFile })
    );
    expect(console.log).toHaveBeenCalledWith(
      `Using Go 1.27.0 (from ${filename ?? 'go.mod'})`
    );
  });

  it('honors GOWORK inherited from the process environment', async () => {
    vi.stubEnv('GOWORK', 'off');
    await writeFile(join(repo, 'go.work'), 'go 1.27.0\n\nuse .\n');
    vi.mocked(createGo).mockResolvedValue(fakeGo({ kind: 'default' }));

    await buildStandaloneServer(buildOptions());

    expect(createGo).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceFile: undefined })
    );
  });

  it('warns when no go.mod or go.work is found anywhere up to the repo root', async () => {
    vi.mocked(createGo).mockResolvedValue(fakeGo({ kind: 'default' }));

    await buildStandaloneServer(buildOptions());

    expect(createGo).toHaveBeenCalledWith(
      expect.objectContaining({
        modulePath: serviceRoot,
        workspaceFile: undefined,
      })
    );
    expect(console.log).toHaveBeenCalledWith('Using Go 1.27.0 (default)');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `Warning: no go.mod or go.work found for ${entrypoint} (searched up to ${repo})`
      )
    );
  });

  it('searches no further than workPath when there is no repoRootPath', async () => {
    await writeFile(
      join(repo, 'go.mod'),
      'module example.com/repo\n\ngo 1.27.0\n'
    );
    vi.mocked(createGo).mockResolvedValue(fakeGo({ kind: 'default' }));

    await buildStandaloneServer(buildOptions({ repoRootPath: undefined }));

    expect(createGo).toHaveBeenCalledWith(
      expect.objectContaining({
        modulePath: serviceRoot,
        workPath: serviceRoot,
      })
    );
  });
});
