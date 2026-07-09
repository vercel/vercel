import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('execa', () => ({
  default: vi.fn(),
}));

vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  debug: vi.fn(),
}));

import execa from 'execa';
import { FileFsRef } from '@vercel/build-utils';
import {
  COMPILEALL_TIMEOUT_MS,
  PYCACHE_PREFIX_DIR,
  RUNTIME_PYCACHE_PREFIX,
  collectAppBytecodeFiles,
  collectAppPrefixBytecodeFiles,
  derivePrefixPycBundlePath,
  derivePrefixPycRelPath,
  derivePycPath,
  deriveStagedPycFsPath,
  getCompileAllAppExcludeRegex,
  runCompileAll,
  shouldCompileAll,
} from '../src/compileall';
import {
  BYTECODE_FILL_CEILING_BYTES,
  LAMBDA_SIZE_THRESHOLD_BYTES,
} from '../src/dependency-externalizer';

const mockedExeca = vi.mocked(execa);
const originalCompileAllEnv = process.env.VERCEL_PYTHON_COMPILEALL;
const originalLargeFnEnv = process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
const tmpDirs: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (originalCompileAllEnv === undefined) {
    delete process.env.VERCEL_PYTHON_COMPILEALL;
  } else {
    process.env.VERCEL_PYTHON_COMPILEALL = originalCompileAllEnv;
  }
  if (originalLargeFnEnv === undefined) {
    delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
  } else {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = originalLargeFnEnv;
  }
});

describe('shouldCompileAll', () => {
  it('enables compileall with truthy flag values', () => {
    process.env.VERCEL_PYTHON_COMPILEALL = '1';
    expect(shouldCompileAll({ isDev: false, hasCustomCommand: false })).toBe(
      true
    );

    process.env.VERCEL_PYTHON_COMPILEALL = 'true';
    expect(shouldCompileAll({ isDev: false, hasCustomCommand: false })).toBe(
      true
    );

    process.env.VERCEL_PYTHON_COMPILEALL = 'TRUE';
    expect(shouldCompileAll({ isDev: false, hasCustomCommand: false })).toBe(
      true
    );
  });

  it('does not require VERCEL_SUPPORT_LARGE_FUNCTIONS', () => {
    delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(shouldCompileAll({ isDev: false, hasCustomCommand: false })).toBe(
      true
    );
  });

  it('stays disabled without the flag or with non-truthy flag values', () => {
    delete process.env.VERCEL_PYTHON_COMPILEALL;
    expect(shouldCompileAll({ isDev: false, hasCustomCommand: false })).toBe(
      false
    );

    for (const val of ['', '0', 'false']) {
      process.env.VERCEL_PYTHON_COMPILEALL = val;
      expect(shouldCompileAll({ isDev: false, hasCustomCommand: false })).toBe(
        false
      );
    }
  });

  it('does not enable compileall in dev', () => {
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(shouldCompileAll({ isDev: true, hasCustomCommand: false })).toBe(
      false
    );
  });

  it('does not enable compileall for custom install commands', () => {
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(shouldCompileAll({ isDev: false, hasCustomCommand: true })).toBe(
      false
    );
  });

  it('does not enable compileall when a pre-deploy command is configured', () => {
    // A preDeployCommand can rewrite source after the build, which would make
    // unchecked-hash bytecode stale, so precompilation must be skipped.
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(
      shouldCompileAll({
        isDev: false,
        hasCustomCommand: false,
        hasPreDeployCommand: true,
      })
    ).toBe(false);
  });

  it('keeps the fill ceiling safely below the Lambda size threshold', () => {
    expect(BYTECODE_FILL_CEILING_BYTES).toBeLessThan(
      LAMBDA_SIZE_THRESHOLD_BYTES
    );
  });
});

describe('runCompileAll', () => {
  it('passes -j 0, -f, and exclude regex to compileall when provided', async () => {
    mockedExeca.mockResolvedValue({} as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };

    await runCompileAll({
      pythonBin: '/work/.vercel/python/.venv/bin/python',
      filesOrDirectories: ['/work'],
      env,
      excludeRegex: '[/\\\\]\\.vercel(?:[/\\\\]|$)',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      '/work/.vercel/python/.venv/bin/python',
      [
        '-m',
        'compileall',
        '-q',
        '-j',
        '0',
        '-f',
        '--invalidation-mode',
        'unchecked-hash',
        '-x',
        '[/\\\\]\\.vercel(?:[/\\\\]|$)',
        '/work',
      ],
      { env, timeout: COMPILEALL_TIMEOUT_MS }
    );
  });

  it('resolves without throwing when compileall fails', async () => {
    mockedExeca.mockRejectedValue(new Error('compileall crashed'));

    await expect(
      runCompileAll({
        pythonBin: '/work/.vercel/python/.venv/bin/python',
        filesOrDirectories: ['/work'],
      })
    ).resolves.toBeUndefined();
  });

  it('sets PYTHONPYCACHEPREFIX on the subprocess when pycachePrefix is provided', async () => {
    mockedExeca.mockResolvedValue({} as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };

    await runCompileAll({
      pythonBin: '/work/.vercel/python/.venv/bin/python',
      filesOrDirectories: ['/work'],
      env,
      pycachePrefix: '/work/.vercel/python/pycache',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      '/work/.vercel/python/.venv/bin/python',
      expect.arrayContaining(['-m', 'compileall']),
      {
        env: { ...env, PYTHONPYCACHEPREFIX: '/work/.vercel/python/pycache' },
        timeout: COMPILEALL_TIMEOUT_MS,
      }
    );
  });

  it('does not set PYTHONPYCACHEPREFIX without pycachePrefix', async () => {
    mockedExeca.mockResolvedValue({} as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };

    await runCompileAll({
      pythonBin: '/work/.vercel/python/.venv/bin/python',
      filesOrDirectories: ['/work'],
      env,
    });

    const passedEnv = mockedExeca.mock.calls[0][2]?.env as Record<
      string,
      string
    >;
    expect(passedEnv.PYTHONPYCACHEPREFIX).toBeUndefined();
  });
});

describe('derivePycPath', () => {
  it('derives the CPython pyc path for Python source files', () => {
    expect(derivePycPath('pkg/mod.py', 3, 12)).toBe(
      'pkg/__pycache__/mod.cpython-312.pyc'
    );
  });

  it('returns null for non-Python files', () => {
    expect(derivePycPath('pkg/data.txt', 3, 12)).toBeNull();
  });
});

describe('pycache-prefix path derivation', () => {
  it('derives the prefix-relative pyc path (no __pycache__ component)', () => {
    expect(derivePrefixPycRelPath('pkg/mod.py', 3, 12)).toBe(
      'pkg/mod.cpython-312.pyc'
    );
    expect(derivePrefixPycRelPath('pkg/data.txt', 3, 12)).toBeNull();
  });

  it('derives the staged pyc fs path from an absolute source path', () => {
    expect(
      deriveStagedPycFsPath('/staging', '/vercel/path0/src/app.py', 3, 12)
    ).toBe('/staging/vercel/path0/src/app.cpython-312.pyc');
    expect(deriveStagedPycFsPath('/staging', '/x/lib.so', 3, 12)).toBeNull();
  });

  it('strips the Windows drive like CPython cache_from_source (vercel build on Windows)', () => {
    const derived = deriveStagedPycFsPath(
      '/staging',
      'C:\\Users\\dev\\proj\\app.py',
      3,
      12
    );
    // CPython drops the drive and leading separators before joining onto
    // the prefix, so the derived path must not retain "C:".
    expect(derived).not.toBeNull();
    expect(derived).not.toContain('C:');
    expect(derived!.replaceAll('\\', '/')).toBe(
      '/staging/Users/dev/proj/app.cpython-312.pyc'
    );
  });

  it('derives the zip bundle key from a runtime absolute path', () => {
    expect(
      derivePrefixPycBundlePath('/var/task/_vendor/pkg/mod.py', 3, 12)
    ).toBe(`${PYCACHE_PREFIX_DIR}/var/task/_vendor/pkg/mod.cpython-312.pyc`);
    expect(
      derivePrefixPycBundlePath(
        '/tmp/_vc_deps/lib/python3.12/site-packages/pkg/mod.py',
        3,
        12
      )
    ).toBe(
      `${PYCACHE_PREFIX_DIR}/tmp/_vc_deps/lib/python3.12/site-packages/pkg/mod.cpython-312.pyc`
    );
  });

  it('runtime prefix constant addresses the bundle tree under /var/task', () => {
    expect(RUNTIME_PYCACHE_PREFIX).toBe(`/var/task/${PYCACHE_PREFIX_DIR}`);
  });
});

describe('getCompileAllAppExcludeRegex', () => {
  it('produces a regex that matches excluded directories under workPath', () => {
    const regex = new RegExp(getCompileAllAppExcludeRegex('/work'));
    expect(regex.test('/work/.venv/lib/python3.12/foo.py')).toBe(true);
    expect(regex.test('/work/node_modules/pkg/index.py')).toBe(true);
    expect(regex.test('/work/__pycache__/app.cpython-312.pyc')).toBe(true);
    expect(regex.test('/work/.git/hooks/pre-commit')).toBe(true);
  });

  it('does not match regular application paths', () => {
    const regex = new RegExp(getCompileAllAppExcludeRegex('/work'));
    expect(regex.test('/work/app.py')).toBe(false);
    expect(regex.test('/work/src/main.py')).toBe(false);
    expect(regex.test('/work/pkg/utils.py')).toBe(false);
  });
});

describe('app bytecode collection', () => {
  function makeTempWorkPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-py-compileall-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('collects bytecode only for included app sources', async () => {
    const workPath = makeTempWorkPath();
    const includedPyc = path.join(
      workPath,
      'pkg',
      '__pycache__',
      'app.cpython-312.pyc'
    );
    const excludedPyc = path.join(
      workPath,
      'tests',
      '__pycache__',
      'test_app.cpython-312.pyc'
    );
    fs.mkdirSync(path.dirname(includedPyc), { recursive: true });
    fs.mkdirSync(path.dirname(excludedPyc), { recursive: true });
    fs.writeFileSync(path.join(workPath, 'pkg', 'app.py'), 'print("ok")');
    fs.writeFileSync(includedPyc, Buffer.alloc(10));
    fs.writeFileSync(excludedPyc, Buffer.alloc(20));

    const result = await collectAppBytecodeFiles({
      workPath,
      files: {
        'pkg/app.py': new FileFsRef({
          fsPath: path.join(workPath, 'pkg', 'app.py'),
        }),
      },
      pythonMajor: 3,
      pythonMinor: 12,
    });

    expect(Object.keys(result.files)).toEqual([
      'pkg/__pycache__/app.cpython-312.pyc',
    ]);
    expect(result.totalSize).toBe(10);
    expect(result.perItemSizes.get('pkg/__pycache__/app.cpython-312.pyc')).toBe(
      10
    );
  });

  it('collects staged prefix bytecode keyed under the runtime task root', async () => {
    const workPath = makeTempWorkPath();
    const stagingDir = path.join(workPath, '.vercel', 'python', 'pycache');

    // compileall with PYTHONPYCACHEPREFIX writes
    // <staging>/<abs source dir>/<mod>.<tag>.pyc
    const stagedPyc = path.join(
      stagingDir,
      workPath.replace(/^[/\\]+/, ''),
      'pkg',
      'app.cpython-312.pyc'
    );
    fs.mkdirSync(path.dirname(stagedPyc), { recursive: true });
    fs.writeFileSync(stagedPyc, Buffer.alloc(12));

    const result = await collectAppPrefixBytecodeFiles({
      stagingDir,
      workPath,
      files: {
        'pkg/app.py': new FileFsRef({
          fsPath: path.join(workPath, 'pkg', 'app.py'),
        }),
        'static/logo.png': new FileFsRef({
          fsPath: path.join(workPath, 'static', 'logo.png'),
        }),
      },
      runtimeTaskRoot: '/var/task',
      pythonMajor: 3,
      pythonMinor: 12,
    });

    expect(Object.keys(result.files)).toEqual([
      `${PYCACHE_PREFIX_DIR}/var/task/pkg/app.cpython-312.pyc`,
    ]);
    expect(result.totalSize).toBe(12);
    const ref = result.files[
      `${PYCACHE_PREFIX_DIR}/var/task/pkg/app.cpython-312.pyc`
    ] as FileFsRef;
    expect(ref.fsPath).toBe(stagedPyc);
  });

  it('silently drops app sources with no staged pyc', async () => {
    const workPath = makeTempWorkPath();
    const stagingDir = path.join(workPath, '.vercel', 'python', 'pycache');
    fs.mkdirSync(stagingDir, { recursive: true });

    const result = await collectAppPrefixBytecodeFiles({
      stagingDir,
      workPath,
      files: {
        'missing.py': new FileFsRef({
          fsPath: path.join(workPath, 'missing.py'),
        }),
      },
      runtimeTaskRoot: '/var/task',
      pythonMajor: 3,
      pythonMinor: 12,
    });

    expect(Object.keys(result.files)).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });
});
