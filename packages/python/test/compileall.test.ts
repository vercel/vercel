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
  collectAppBytecodeFiles,
  derivePycPath,
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
});
