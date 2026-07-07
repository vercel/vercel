import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('execa', () => ({ default: vi.fn() }));
vi.mock('which', () => ({ default: vi.fn() }));
vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  debug: vi.fn(),
}));

import execa from 'execa';
import which from 'which';
import { isNativeLibrary, stripNativeLibraries } from '../src/strip';

const mockedExeca = vi.mocked(execa);
const mockedWhich = vi.mocked(which);

const hostArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const otherArch = hostArch === 'aarch64' ? 'x86_64' : 'aarch64';

const tmpDirs: string[] = [];
const originalStripEnv = process.env.VERCEL_PYTHON_STRIP_DEBUG;

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-strip-'));
  tmpDirs.push(dir);
  return dir;
}

/** Build a distributions map containing the given relative file paths. */
function distributions(dir: string, relPaths: string[]) {
  const dist = {
    files: relPaths.map(p => ({ path: p, size: undefined })),
  };
  // Cast through unknown: the test only relies on the `files` field.
  return new Map([[dir, new Map([['pkg', dist]])]]) as any;
}

/** `which` only finds the named tools. */
function onlyTools(...available: string[]) {
  mockedWhich.mockImplementation((async (name: string) => {
    if (available.includes(name)) return `/usr/bin/${name}`;
    throw new Error('not found');
  }) as unknown as typeof which);
}

beforeEach(() => {
  mockedExeca.mockReset();
  mockedWhich.mockReset();
  delete process.env.VERCEL_PYTHON_STRIP_DEBUG;
});

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (originalStripEnv === undefined) {
    delete process.env.VERCEL_PYTHON_STRIP_DEBUG;
  } else {
    process.env.VERCEL_PYTHON_STRIP_DEBUG = originalStripEnv;
  }
});

describe('isNativeLibrary', () => {
  it.each([
    ['pkg/_speedups.so', true],
    ['pkg/lib.cpython-312-x86_64-linux-gnu.so', true],
    ['pkg/libfoo.so.1', true],
    ['pkg/libfoo.so.1.2.3', true],
    ['pkg/module.py', false],
    ['pkg/data.sodium', false],
    ['pkg/notes.so.txt', false],
  ])('%s -> %s', (input, expected) => {
    expect(isNativeLibrary(input)).toBe(expected);
  });
});

describe('stripNativeLibraries', () => {
  it('skips in dev', async () => {
    onlyTools('strip');
    const result = await stripNativeLibraries({
      sitePackageDirs: ['/site'],
      distributions: distributions('/site', ['pkg/_a.so']),
      targetArch: hostArch,
      isDev: true,
    });
    expect(result).toEqual({ count: 0, savedBytes: 0 });
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('skips when disabled via env', async () => {
    process.env.VERCEL_PYTHON_STRIP_DEBUG = '0';
    onlyTools('strip');
    const result = await stripNativeLibraries({
      sitePackageDirs: ['/site'],
      distributions: distributions('/site', ['pkg/_a.so']),
      targetArch: hostArch,
    });
    expect(result).toEqual({ count: 0, savedBytes: 0 });
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('skips when no strip tool is available', async () => {
    onlyTools();
    const result = await stripNativeLibraries({
      sitePackageDirs: ['/site'],
      distributions: distributions('/site', ['pkg/_a.so']),
      targetArch: hostArch,
    });
    expect(result).toEqual({ count: 0, savedBytes: 0 });
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('skips cross-arch when only binutils strip is available', async () => {
    onlyTools('strip');
    const result = await stripNativeLibraries({
      sitePackageDirs: ['/site'],
      distributions: distributions('/site', ['pkg/_a.so']),
      targetArch: otherArch,
    });
    expect(result).toEqual({ count: 0, savedBytes: 0 });
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('uses llvm-strip for cross-arch builds', async () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'pkg'));
    const soPath = path.join(dir, 'pkg', '_a.so');
    fs.writeFileSync(soPath, Buffer.alloc(100));

    onlyTools('llvm-strip');
    mockedExeca.mockImplementation((async (_bin: string, args: string[]) => {
      fs.truncateSync(args[args.length - 1], 40);
      return {} as unknown;
    }) as unknown as typeof execa);

    const result = await stripNativeLibraries({
      sitePackageDirs: [dir],
      distributions: distributions(dir, ['pkg/_a.so']),
      targetArch: otherArch,
    });

    expect(mockedExeca).toHaveBeenCalledWith('/usr/bin/llvm-strip', [
      '--strip-debug',
      soPath,
    ]);
    expect(result).toEqual({ count: 1, savedBytes: 60 });
    expect(fs.statSync(soPath).size).toBe(40);
  });

  it('strips matching-arch native libraries and reports saved bytes', async () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'pkg'));
    const a = path.join(dir, 'pkg', '_a.so');
    const b = path.join(dir, 'pkg', 'libb.so.2');
    fs.writeFileSync(a, Buffer.alloc(100));
    fs.writeFileSync(b, Buffer.alloc(50));

    onlyTools('strip');
    mockedExeca.mockImplementation((async (_bin: string, args: string[]) => {
      // Simulate stripping by removing half the bytes for each file arg.
      const filePaths = args.filter(a => !a.startsWith('--'));
      for (const file of filePaths) {
        fs.truncateSync(file, Math.floor(fs.statSync(file).size / 2));
      }
      return {} as unknown;
    }) as unknown as typeof execa);

    const result = await stripNativeLibraries({
      sitePackageDirs: [dir],
      distributions: distributions(dir, [
        'pkg/_a.so',
        'pkg/libb.so.2',
        'pkg/m.py',
      ]),
      targetArch: hostArch,
    });

    expect(result.count).toBe(2);
    expect(result.savedBytes).toBe(75); // 50 + 25
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('is fail-soft when strip errors on a file', async () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'pkg'));
    const soPath = path.join(dir, 'pkg', '_a.so');
    fs.writeFileSync(soPath, Buffer.alloc(100));

    onlyTools('strip');
    mockedExeca.mockRejectedValue(new Error('strip: bad object'));

    const result = await stripNativeLibraries({
      sitePackageDirs: [dir],
      distributions: distributions(dir, ['pkg/_a.so']),
      targetArch: hostArch,
    });

    expect(result).toEqual({ count: 0, savedBytes: 0 });
    expect(fs.statSync(soPath).size).toBe(100); // untouched
  });

  it('returns early when there are no native libraries', async () => {
    onlyTools('strip');
    const result = await stripNativeLibraries({
      sitePackageDirs: ['/site'],
      distributions: distributions('/site', ['pkg/m.py', 'pkg/data.json']),
      targetArch: hostArch,
    });
    expect(result).toEqual({ count: 0, savedBytes: 0 });
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('batches multiple files into a single strip invocation', async () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'pkg'));
    const relPaths: string[] = [];
    for (let i = 0; i < 10; i++) {
      const relPath = `pkg/_lib${i}.so`;
      fs.writeFileSync(path.join(dir, relPath), Buffer.alloc(100));
      relPaths.push(relPath);
    }

    onlyTools('strip');
    mockedExeca.mockImplementation((async (_bin: string, args: string[]) => {
      const filePaths = args.filter(a => !a.startsWith('--'));
      for (const file of filePaths) {
        fs.truncateSync(file, Math.floor(fs.statSync(file).size / 2));
      }
      return {} as unknown;
    }) as unknown as typeof execa);

    const result = await stripNativeLibraries({
      sitePackageDirs: [dir],
      distributions: distributions(dir, relPaths),
      targetArch: hostArch,
    });

    expect(result.count).toBe(10);
    expect(result.savedBytes).toBe(500); // 10 × 50
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-file stripping when a batch fails', async () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'pkg'));
    const a = path.join(dir, 'pkg', '_a.so');
    const b = path.join(dir, 'pkg', '_b.so');
    const c = path.join(dir, 'pkg', '_c.so');
    fs.writeFileSync(a, Buffer.alloc(100));
    fs.writeFileSync(b, Buffer.alloc(80));
    fs.writeFileSync(c, Buffer.alloc(60));

    onlyTools('strip');
    mockedExeca.mockImplementation((async (_bin: string, args: string[]) => {
      const filePaths = args.filter(x => !x.startsWith('--'));
      if (filePaths.length > 1) {
        // Batch call — reject to trigger per-file fallback.
        throw new Error('strip: bad object in batch');
      }
      // Per-file retry: succeed for a and b, fail for c.
      const file = filePaths[0];
      if (path.basename(file) === '_c.so') {
        throw new Error('strip: bad object');
      }
      fs.truncateSync(file, Math.floor(fs.statSync(file).size / 2));
      return {} as unknown;
    }) as unknown as typeof execa);

    const result = await stripNativeLibraries({
      sitePackageDirs: [dir],
      distributions: distributions(dir, [
        'pkg/_a.so',
        'pkg/_b.so',
        'pkg/_c.so',
      ]),
      targetArch: hostArch,
    });

    // a: 100 → 50 (saved 50), b: 80 → 40 (saved 40), c: untouched
    expect(result.count).toBe(2);
    expect(result.savedBytes).toBe(90);
    expect(fs.statSync(a).size).toBe(50);
    expect(fs.statSync(b).size).toBe(40);
    expect(fs.statSync(c).size).toBe(60); // untouched
  });
});
