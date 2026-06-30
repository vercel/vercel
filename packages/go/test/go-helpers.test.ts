vi.mock('execa', () => {
  const execa = Object.assign(vi.fn(), {
    stdout: vi.fn(),
  });
  return { __esModule: true, default: execa };
});

import fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirp, remove, writeFile } from 'fs-extra';
import execa from 'execa';
import type { Mock, MockedFunction } from 'vitest';
import {
  GoWrapper,
  isElfBinary,
  getGoModuleName,
  findGoBinary,
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

function createResolvedSubprocess() {
  return Object.assign(Promise.resolve({ stdout: '', stderr: '' }), {
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
