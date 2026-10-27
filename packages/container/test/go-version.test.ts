import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Monorepo-relative import on purpose: `@vercel/container` must not depend on
// `@vercel/go`, but zero-config builds must try the same entrypoints it does.
import { GO_CANDIDATE_ENTRYPOINTS as VERCEL_GO_CANDIDATE_ENTRYPOINTS } from '../../go/src/entrypoint';
import { GO_CANDIDATE_ENTRYPOINTS, go } from '../src/buildpacks/go';

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));
vi.mock('node:fs', () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => {
    if (!files.has(path)) throw new Error(`Unexpected file read: ${path}`);
    return files.get(path);
  },
}));

const workPath = join('/', 'project');

function seed(projectFiles: Record<string, string>) {
  for (const [name, contents] of Object.entries(projectFiles)) {
    files.set(join(workPath, name), contents);
  }
}

function resolve(goMod?: string) {
  if (goMod !== undefined) seed({ 'go.mod': goMod });
  return go.resolveImage(workPath);
}

const image = (version: string) => ({
  version,
  buildImage: `docker.io/library/golang:${version}-bookworm`,
  runImage: 'gcr.io/distroless/cc-debian12',
});

const module = (...directives: string[]) =>
  ['module example.com/app', '', ...directives, ''].join('\n');

beforeEach(() => {
  files.clear();
});

describe('Go buildpack descriptor', () => {
  it('routes on go.mod and pins the vercel/go buildpack', () => {
    expect(go.runtime).toBe('go');
    expect(go.projectMarkers).toEqual(['go.mod']);
    expect(go.buildpacks.map(entry => entry.id)).toEqual(['vercel/go']);
  });

  it('builds on a stock golang image and runs on distroless with glibc', async () => {
    // A CGO_ENABLED=1 executable loads the glibc (and C++ runtime) of the
    // Debian release the build image compiled against, so the run image
    // ships them; static executables run there too.
    expect(await resolve(module('go 1.26'))).toEqual(image('1.26'));
  });
});

describe('Go version selection', () => {
  it.each([
    ['go 1.25.0\n', '1.25.0'],
    ['go 1.25\n', '1.25'],
    ['go 1.18\n', '1'],
    ['go 1.20.0\n', '1'],
    ['go 1.21.0\n', '1.21.0'],
    ['go 1.18\ntoolchain go1.25.0\n', '1.25.0'],
    ['go 1.25.0\ntoolchain go1.26.1\n', '1.26.1'],
    ['toolchain go1.26.1\ngo 1.25.0\n', '1.26.1'],
    ['go 1.25.0\ntoolchain default\n', '1.25.0'],
    ['go 1.25.0\ntoolchain go1.26rc1\n', '1.25.0'],
    ['go 1.25.0 // minimum\ntoolchain go1.26.1 // preferred\n', '1.26.1'],
    ['\tgo\t1.25.0\t// minimum\n', '1.25.0'],
    ['go 1.25.0\r\ntoolchain go1.26.1\r\n', '1.26.1'],
    ['// toolchain go1.24.0\ngo 1.25.0\n', '1.25.0'],
    ['', '1'],
    ['// go 1.24.0\n', '1'],
    ['go 1.26rc1\n', '1'],
    ['go evil.example/golang:1.25\n', '1'],
    ['go 01.25.0\n', '1'],
    ['go 9007199254740992.25.0\n', '1'],
    ['go 1.25.0\ntoolchain go../../evil\n', '1.25.0'],
    // The image's toolchain must satisfy the go directive too: with
    // GOTOOLCHAIN=local an older image than the go line fails the build.
    ['go 1.26.1\ntoolchain go1.25.3\n', '1.26.1'],
  ])('selects %j as image version %s', async (directives, version) => {
    files.set(
      join(workPath, 'go.mod'),
      `module example.com/app\n\n${directives}`
    );
    expect(await go.resolveImage(workPath)).toEqual({
      version,
      buildImage: `docker.io/library/golang:${version}-bookworm`,
      runImage: 'gcr.io/distroless/cc-debian12',
    });
  });

  it('uses only the service go.mod, without requiring go.sum', async () => {
    files.set(join('/', 'go.mod'), 'go 1.24.0\n');
    files.set(join(workPath, 'go.work'), 'go 1.26.0\n');
    files.set(join(workPath, 'go.mod'), 'module example.com/app\n');
    expect(await go.resolveImage(workPath)).toMatchObject({ version: '1' });
  });

  it('reads the directives, not look-alike module paths or godebug settings', async () => {
    const goMod = [
      'module example.com/go',
      '',
      'godebug default=go1.21',
      'go 1.26.1',
      '',
      'require (',
      '\tgo.uber.org/zap v1.27.0',
      '\tgolang.org/x/net v0.25.0 // indirect',
      ')',
      '',
      '// go 1.19',
      '// toolchain go1.19.1',
    ].join('\n');
    expect(await resolve(goMod)).toEqual(image('1.26.1'));
  });

  it('defaults to the latest Go 1 image when go.mod declares no version', async () => {
    expect(await resolve(module())).toEqual(image('1'));
    files.clear();
    expect(await resolve()).toEqual(image('1'));
  });

  it('never performs network requests', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('Unexpected network request');
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await resolve(module('go 1.26', 'toolchain go1.26.2'));
      files.clear();
      await resolve(module('go 1.18'));
      files.clear();
      await resolve();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Go default entrypoint', () => {
  const defaultEntrypoint = (zeroConfig: boolean) =>
    go.defaultEntrypoint!({ workPath, zeroConfig });

  it('tries the same entrypoints as @vercel/go, in the same order', () => {
    expect(GO_CANDIDATE_ENTRYPOINTS).toEqual(VERCEL_GO_CANDIDATE_ENTRYPOINTS);
  });

  it.each([
    [['main.go', 'cmd/api/main.go', 'cmd/server/main.go'], '.'],
    [['cmd/api/main.go', 'cmd/worker/main.go'], 'cmd/api'],
    [['cmd/server/main.go', 'cmd/migrate/main.go'], 'cmd/server'],
    [['cmd/api/main.go', 'cmd/server/main.go'], 'cmd/api'],
  ])('builds the package of the first candidate among %j', (names, expected) => {
    seed(Object.fromEntries(names.map(name => [name, ''])));
    expect(defaultEntrypoint(true)).toBe(expected);
    expect(defaultEntrypoint(false)).toBe(expected);
  });

  it('leaves a service without a candidate to the buildpack', () => {
    seed({ 'cmd/web/main.go': '' });
    expect(defaultEntrypoint(false)).toBeUndefined();
  });

  it('fails a zero-config app without a candidate', () => {
    seed({ 'cmd/web/main.go': '' });
    expect(() => defaultEntrypoint(true)).toThrow(
      new Error(
        "Couldn't find the Go program to build. Add main.go, cmd/api/main.go, or cmd/server/main.go, or set the VERCEL_ENTRYPOINT environment variable to its package directory or a .go file in it."
      )
    );
  });
});
