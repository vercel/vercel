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
  it('passes a deduplicated JSON source list to the compile coordinator', async () => {
    let listPath = '';
    let sourceList: string[] = [];
    mockedExeca.mockImplementation(((_file, args: string[]) => {
      listPath = args[1];
      sourceList = JSON.parse(fs.readFileSync(listPath, 'utf8'));
      return Promise.resolve({});
    }) as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };

    await expect(
      runCompileAll({
        pythonBin: '/work/.vercel/python/.venv/bin/python',
        sourceFiles: ['/work/app.py', '/work/pkg/mod.py', '/work/app.py'],
        env,
      })
    ).resolves.toBe(true);

    const args = mockedExeca.mock.calls[0][1];
    expect(args).toEqual([
      expect.stringMatching(/templates[/\\\\]vc_compileall\.py$/),
      listPath,
    ]);
    expect(mockedExeca).toHaveBeenCalledWith(
      '/work/.vercel/python/.venv/bin/python',
      args,
      { env, timeout: COMPILEALL_TIMEOUT_MS }
    );
    expect(sourceList).toEqual(['/work/app.py', '/work/pkg/mod.py']);
    expect(fs.existsSync(listPath)).toBe(false);
    expect(fs.existsSync(path.dirname(listPath))).toBe(false);
  });

  it('does not invoke the coordinator when there are no source files', async () => {
    await expect(
      runCompileAll({ pythonBin: 'python3', sourceFiles: [] })
    ).resolves.toBe(false);

    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('returns false and removes the temporary list after failure', async () => {
    let listPath = '';
    mockedExeca.mockImplementation(((_file, args: string[]) => {
      listPath = args[1];
      expect(fs.existsSync(listPath)).toBe(true);
      return Promise.reject(
        Object.assign(new Error('compileall exited with code 1'), {
          exitCode: 1,
        })
      );
    }) as any);

    await expect(
      runCompileAll({
        pythonBin: 'python3',
        sourceFiles: ['/work/app.py'],
      })
    ).resolves.toBe(false);

    expect(fs.existsSync(listPath)).toBe(false);
    expect(fs.existsSync(path.dirname(listPath))).toBe(false);
  });

  it('returns false and removes the temporary list after timeout', async () => {
    let listPath = '';
    mockedExeca.mockImplementation(((_file, args: string[]) => {
      listPath = args[1];
      return Promise.reject(
        Object.assign(new Error('compileall timed out'), { timedOut: true })
      );
    }) as any);

    await expect(
      runCompileAll({
        pythonBin: 'python3',
        sourceFiles: ['/work/app.py'],
      })
    ).resolves.toBe(false);

    expect(fs.existsSync(listPath)).toBe(false);
    expect(fs.existsSync(path.dirname(listPath))).toBe(false);
  });

  it('sets PYTHONPYCACHEPREFIX on the subprocess when provided', async () => {
    mockedExeca.mockResolvedValue({} as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };
    await runCompileAll({
      pythonBin: '/work/.vercel/python/.venv/bin/python',
      sourceFiles: ['/work/app.py'],
      env,
      pycachePrefix: '/work/.vercel/python/pycache',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      '/work/.vercel/python/.venv/bin/python',
      [
        expect.stringMatching(/templates[/\\\\]vc_compileall\.py$/),
        expect.stringMatching(/pysources\.json$/),
      ],
      {
        env: { ...env, PYTHONPYCACHEPREFIX: '/work/.vercel/python/pycache' },
        timeout: COMPILEALL_TIMEOUT_MS,
      }
    );
  });

  it('does not set PYTHONPYCACHEPREFIX without a prefix', async () => {
    mockedExeca.mockResolvedValue({} as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };
    await runCompileAll({
      pythonBin: '/work/.vercel/python/.venv/bin/python',
      sourceFiles: ['/work/app.py'],
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
    ).toBe(
      path.join('/staging', 'vercel', 'path0', 'src', 'app.cpython-312.pyc')
    );
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
    expect(derived!.replaceAll('\\', path.sep)).toBe(
      path.join('/staging', 'Users', 'dev', 'proj', 'app.cpython-312.pyc')
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
    const appSourcePath = path.join(workPath, 'pkg', 'app.py');
    const stagedPyc = deriveStagedPycFsPath(stagingDir, appSourcePath, 3, 12);
    expect(stagedPyc).not.toBeNull();
    fs.mkdirSync(path.dirname(stagedPyc!), { recursive: true });
    fs.writeFileSync(stagedPyc!, Buffer.alloc(12));

    const result = await collectAppPrefixBytecodeFiles({
      stagingDir,
      workPath,
      files: {
        'pkg/app.py': new FileFsRef({
          fsPath: appSourcePath,
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
    expect(ref.fsPath).toBe(stagedPyc!);
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
