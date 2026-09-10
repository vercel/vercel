vi.mock('execa', () => {
  const execa = Object.assign(vi.fn(), {
    stdout: vi.fn(),
  });
  return { __esModule: true, default: execa };
});

vi.mock('node-fetch', () => ({
  default: vi.fn(() => {
    throw new Error('Unexpected Go download');
  }),
}));

import fs from 'fs';
import { tmpdir } from 'os';
import { join, relative, sep } from 'path';
import { mkdirp, remove, writeFile } from 'fs-extra';
import execa from 'execa';
import type { Mock, MockedFunction } from 'vitest';
import {
  GoWrapper,
  createGo,
  isElfBinary,
  getGoModuleName,
  findGoBinary,
  findGoModPath,
  findGoWorkPath,
  getInstalledGoVersion,
  isBelowMinDarwinRunnable,
  newestSupportedGoVersion,
  selectGoVersion,
} from '../src/go-helpers';

const mockedExeca = execa as unknown as MockedFunction<typeof execa> & {
  stdout: Mock;
};

function createRejectedSubprocess(error: Error) {
  return Object.assign(Promise.reject(error), {
    stdout: undefined,
    stderr: undefined,
  });
}

function createResolvedSubprocess(stdout = '') {
  return Object.assign(Promise.resolve({ stdout, stderr: '' }), {
    stdout: undefined,
    stderr: undefined,
  });
}

describe('GoWrapper', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
    mockedExeca.stdout.mockReset();
  });

  it('includes compiler output when go build fails', async () => {
    const compilerOutput =
      '# example.com/project\n./main.go:14:9: undefined: handler';
    const execaError = Object.assign(
      new Error(
        'Command failed: go build -ldflags -s -w -o /tmp/3db69a0d/user-server .'
      ),
      {
        stderr: compilerOutput,
        stdout: '',
      }
    );
    mockedExeca.mockReturnValue(createRejectedSubprocess(execaError) as any);

    const go = new GoWrapper(process.env as any);

    let error: Error | undefined;
    try {
      await go.build('.', '/tmp/3db69a0d/user-server');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain(
      'Command failed: go build -ldflags -s -w -o /tmp/3db69a0d/user-server .'
    );
    expect(error?.message).toContain(compilerOutput);
    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-ldflags', '-s -w', '-o', '/tmp/3db69a0d/user-server', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('calls go mod tidy', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.mod();

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['mod', 'tidy'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('calls go mod tidy with -e when tolerateErrors is true', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.mod({ tolerateErrors: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['mod', 'tidy', '-e'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('calls go mod vendor', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.vendor();

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['mod', 'vendor'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('includes -mod=vendor flag when vendorMode is true', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.build('.', '/tmp/out', { vendorMode: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-ldflags', '-s -w', '-mod=vendor', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('omits the stripping flags for a debug build', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.build('.', '/tmp/out', { release: false });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('keeps -mod=vendor for a debug build', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.build('.', '/tmp/out', { vendorMode: true, release: false });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-mod=vendor', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('does not add -mod=vendor when GO_BUILD_FLAGS is set', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const env = { ...process.env, GO_BUILD_FLAGS: '-tags test' };
    const go = new GoWrapper(env as any);
    await go.build('.', '/tmp/out', { vendorMode: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-tags', 'test', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('does not add -mod=vendor when vendorMode is false', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.build('.', '/tmp/out');

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-ldflags', '-s -w', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });
});

// ELF magic header: \x7fELF
const ELF_HEADER = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

describe('isElfBinary', () => {
  const testDir = join(tmpdir(), 'vercel-go-test-elf');

  beforeEach(async () => {
    await mkdirp(testDir);
  });

  afterEach(async () => {
    await remove(testDir);
  });

  it('returns true for a file with ELF magic bytes', async () => {
    const p = join(testDir, 'elf-bin');
    await fs.promises.writeFile(
      p,
      Buffer.concat([ELF_HEADER, Buffer.alloc(100)])
    );
    expect(await isElfBinary(p)).toBe(true);
  });

  it('returns false for a non-ELF file', async () => {
    const p = join(testDir, 'not-elf');
    await fs.promises.writeFile(p, 'hello world');
    expect(await isElfBinary(p)).toBe(false);
  });

  it('returns false for a file smaller than 4 bytes', async () => {
    const p = join(testDir, 'tiny');
    await fs.promises.writeFile(p, Buffer.from([0x7f]));
    expect(await isElfBinary(p)).toBe(false);
  });
});

describe('getGoModuleName', () => {
  const testDir = join(tmpdir(), 'vercel-go-test-gomod');

  beforeEach(async () => {
    await mkdirp(testDir);
  });

  afterEach(async () => {
    await remove(testDir);
  });

  it('extracts the last segment of a full module path', async () => {
    const goMod = join(testDir, 'go.mod');
    await writeFile(goMod, 'module github.com/user/myapp\n\ngo 1.22\n');
    expect(await getGoModuleName(goMod)).toBe('myapp');
  });

  it('returns simple module name as-is', async () => {
    const goMod = join(testDir, 'go.mod');
    await writeFile(goMod, 'module myserver\n\ngo 1.22\n');
    expect(await getGoModuleName(goMod)).toBe('myserver');
  });

  it('returns undefined for a missing file', async () => {
    expect(await getGoModuleName(join(testDir, 'nope'))).toBeUndefined();
  });
});

describe('findGoBinary', () => {
  const testDir = join(tmpdir(), 'vercel-go-test-find-bin');
  const destPath = join(tmpdir(), 'vercel-go-test-find-bin-dest');

  beforeEach(async () => {
    await mkdirp(testDir);
    await remove(destPath);
  });

  afterEach(async () => {
    await remove(testDir);
    await remove(destPath);
  });

  it('uses destPath directly when it already exists', async () => {
    await fs.promises.writeFile(destPath, 'binary');
    await findGoBinary(testDir, destPath, undefined, 0);
    expect(await fs.promises.readFile(destPath, 'utf8')).toBe('binary');
  });

  it('finds a binary matching the go.mod module name', async () => {
    const goMod = join(testDir, 'go.mod');
    await writeFile(goMod, 'module github.com/user/myapp\n\ngo 1.22\n');

    const binPath = join(testDir, 'myapp');
    await fs.promises.writeFile(
      binPath,
      Buffer.concat([ELF_HEADER, Buffer.alloc(10)])
    );

    await findGoBinary(testDir, destPath, goMod, 0);
    expect(await isElfBinary(destPath)).toBe(true);
  });

  it('finds a binary with a well-known name', async () => {
    const binPath = join(testDir, 'server');
    await fs.promises.writeFile(
      binPath,
      Buffer.concat([ELF_HEADER, Buffer.alloc(10)])
    );

    await findGoBinary(testDir, destPath, undefined, 0);
    expect(await isElfBinary(destPath)).toBe(true);
  });

  it('finds a binary in the bin/ subdirectory', async () => {
    const binDir = join(testDir, 'bin');
    await mkdirp(binDir);

    const binPath = join(binDir, 'myserver');
    await fs.promises.writeFile(
      binPath,
      Buffer.concat([ELF_HEADER, Buffer.alloc(10)])
    );

    await findGoBinary(testDir, destPath, undefined, 0);
    expect(await isElfBinary(destPath)).toBe(true);
  });

  it('ignores binaries older than buildStartTime', async () => {
    const binPath = join(testDir, 'server');
    await fs.promises.writeFile(
      binPath,
      Buffer.concat([ELF_HEADER, Buffer.alloc(10)])
    );

    const futureTime = Date.now() + 60_000;
    await expect(
      findGoBinary(testDir, destPath, undefined, futureTime)
    ).rejects.toThrow('No compiled Go binary found');
  });

  it('errors when multiple new ELF binaries are found via scan', async () => {
    const bin1 = join(testDir, 'svc-one');
    const bin2 = join(testDir, 'svc-two');
    await fs.promises.writeFile(
      bin1,
      Buffer.concat([ELF_HEADER, Buffer.alloc(10)])
    );
    await fs.promises.writeFile(
      bin2,
      Buffer.concat([ELF_HEADER, Buffer.alloc(10)])
    );

    await expect(findGoBinary(testDir, destPath, undefined, 0)).rejects.toThrow(
      'Found multiple ELF binaries'
    );
  });

  it('errors when no binary is found', async () => {
    await expect(findGoBinary(testDir, destPath, undefined, 0)).rejects.toThrow(
      'No compiled Go binary found'
    );
  });
});

describe('selectGoVersion', () => {
  it('pins the `go` directive for deployed builds', () => {
    expect(selectGoVersion({ go: '1.21.13', toolchain: undefined })).toBe(
      '1.21.13'
    );
  });

  it('treats the `go` directive as a minimum when asked', () => {
    expect(
      selectGoVersion(
        { go: '1.21.13', toolchain: undefined },
        { preferNewestToolchain: true }
      )
    ).toBe(newestSupportedGoVersion());
  });

  it('keeps a `go` directive newer than the newest supported version', () => {
    const [major, minor, patch] = newestSupportedGoVersion()
      .split('.')
      .map(Number);
    const newerVersion = `${major}.${minor}.${patch + 1}`;

    expect(
      selectGoVersion(
        { go: newerVersion, toolchain: undefined },
        { preferNewestToolchain: true }
      )
    ).toBe(newerVersion);
  });

  it('honors an explicit `toolchain` directive in both modes', () => {
    const preferred = { go: '1.21.13', toolchain: '1.22.1' };

    expect(selectGoVersion(preferred)).toBe('1.22.1');
    expect(selectGoVersion(preferred, { preferNewestToolchain: true })).toBe(
      '1.22.1'
    );
  });

  it('uses the newest supported version without a `go.mod`', () => {
    expect(selectGoVersion(undefined)).toBe(newestSupportedGoVersion());
    expect(selectGoVersion(undefined, { preferNewestToolchain: true })).toBe(
      newestSupportedGoVersion()
    );
  });
});

describe('findGoModPath / findGoWorkPath', () => {
  // repo/
  //   go.mod, go.work
  //   services/api/cmd/server/
  //   services/worker/go.mod
  const repo = join(tmpdir(), 'vercel-go-test-find-go-mod');
  const api = join(repo, 'services', 'api');
  const apiEntrypointDir = join(api, 'cmd', 'server');
  const worker = join(repo, 'services', 'worker');

  beforeEach(async () => {
    await mkdirp(apiEntrypointDir);
    await mkdirp(worker);
    await writeFile(join(repo, 'go.work'), 'go 1.27.0\n\nuse ./services/api\n');
    await writeFile(
      join(repo, 'go.mod'),
      'module example.com/repo\n\ngo 1.27.0\n'
    );
    await writeFile(
      join(worker, 'go.mod'),
      'module example.com/worker\n\ngo 1.26.0\n'
    );
  });

  afterEach(async () => {
    await remove(repo);
  });

  it('finds a go.mod above the service root when allowed to search to the repo root', async () => {
    expect(await findGoModPath(apiEntrypointDir, repo)).toBe(
      join(repo, 'go.mod')
    );
  });

  it('stops at the service root when that is the search boundary', async () => {
    expect(await findGoModPath(apiEntrypointDir, api)).toBeUndefined();
  });

  it('prefers the nearest go.mod', async () => {
    expect(await findGoModPath(worker, repo)).toBe(join(worker, 'go.mod'));
  });

  it('finds the file in the boundary directory itself', async () => {
    expect(await findGoModPath(repo, repo)).toBe(join(repo, 'go.mod'));
  });

  it('finds a go.work the same way', async () => {
    expect(await findGoWorkPath(apiEntrypointDir, repo)).toBe(
      join(repo, 'go.work')
    );
    expect(await findGoWorkPath(apiEntrypointDir, api)).toBeUndefined();
  });

  it('disables workspace discovery when GOWORK=off', async () => {
    expect(await findGoWorkPath(api, repo, 'off')).toBeUndefined();
  });

  it('uses an explicit workspace file even outside the search boundary', async () => {
    const workspaceFile = join(repo, 'ci.work');
    await writeFile(workspaceFile, 'go 1.27.0\n\nuse .\n');
    expect(await findGoWorkPath(api, api, workspaceFile)).toBe(workspaceFile);
  });

  it('rejects relative GOWORK paths like the go command', async () => {
    await expect(findGoWorkPath(api, repo, './ci.work')).rejects.toThrow(
      'GOWORK must be an absolute path'
    );
  });

  describe.each([
    { filename: 'go.mod', search: findGoModPath },
    { filename: 'go.work', search: findGoWorkPath },
  ])('$filename boundary enforcement', ({ filename, search }) => {
    it.each([
      ['trailing start separator', `${api}${sep}`, api],
      ['trailing boundary separator', apiEntrypointDir, `${api}${sep}`],
      ['relative boundary', apiEntrypointDir, relative(process.cwd(), api)],
      ['start above boundary', repo, api],
      ['unrelated boundary', api, worker],
      ['shared path prefix', worker, join(repo, 'services', 'work')],
    ])('does not return out-of-bounds files with %s', async (_case, start, stop) => {
      expect(await search(start, stop)).toBeUndefined();
    });

    it('resolves relative paths and includes the normalized boundary', async () => {
      expect(
        await search(relative(process.cwd(), apiEntrypointDir), repo)
      ).toBe(join(repo, filename));
      expect(await search(`${repo}${sep}`, `${repo}${sep}`)).toBe(
        join(repo, filename)
      );
    });
  });
});

describe('createGo', () => {
  const workPath = join(tmpdir(), 'vercel-go-test-workspace-version');

  beforeEach(async () => {
    mockedExeca.mockReset();
    await mkdirp(workPath);
  });

  afterEach(async () => {
    await remove(workPath);
  });

  it('reads the selected workspace file rather than assuming it is named go.work', async () => {
    const workspaceFile = join(workPath, 'ci.work');
    await writeFile(workspaceFile, 'go 1.99.0\ntoolchain go1.99.3\n');
    await writeFile(join(workPath, 'go.work'), 'go 1.26.0\n');
    await writeFile(
      join(workPath, 'go.mod'),
      'module example.com/api\ngo 1.25.0\n'
    );
    mockedExeca.mockReturnValue(
      createResolvedSubprocess('go version go1.99.3 linux/amd64') as any
    );

    const go = await createGo({
      modulePath: workPath,
      workspaceFile,
      workPath,
    });

    expect(go.resolvedVersion).toBe('1.99.3');
    expect(go.versionSource).toEqual({
      kind: 'go.work',
      file: workspaceFile,
      directive: 'toolchain',
    });
  });
});

describe('getInstalledGoVersion', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('asks the installed toolchain for its own version', async () => {
    mockedExeca.mockReturnValue(
      Object.assign(
        Promise.resolve({ stdout: 'go version go1.26.8 linux/amd64' }),
        { stdout: undefined, stderr: undefined }
      ) as any
    );

    const env = { PATH: '/cache/go/bin', GOROOT: '/cache/go' };
    const version = await getInstalledGoVersion(env);

    expect(version).toMatchObject({
      version: '1.26.8',
      short: '1.26',
      major: 1,
      minor: 26,
      patch: 8,
    });
    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['version'],
      expect.objectContaining({
        env: { ...env, GOTOOLCHAIN: 'local' },
        extendEnv: false,
      })
    );
    // The probe must not leak the pin into the env used for the build.
    expect(env).not.toHaveProperty('GOTOOLCHAIN');
  });
});

describe('isBelowMinDarwinRunnable', () => {
  // Verified on macOS 26.6 (arm64): 1.22.12 aborts at exec, 1.23.12 runs.
  it.each([
    ['1.21.13', true],
    ['1.22.12', true],
    ['1.23.12', false],
    ['1.26.1', false],
    ['2.0.0', false],
  ])('reports %s as below the minimum: %s', (version, expected) => {
    expect(isBelowMinDarwinRunnable(version)).toBe(expected);
  });

  it('does not flag an unparseable version', () => {
    expect(isBelowMinDarwinRunnable('tip')).toBe(false);
  });
});
