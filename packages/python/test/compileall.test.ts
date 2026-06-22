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
  collectAppBytecodeFiles,
  derivePycPath,
  getCompileAllAppExcludeRegex,
  isCompileAllEnabled,
  runCompileAll,
  shouldUseCompileAll,
} from '../src/compileall';

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

describe('isCompileAllEnabled', () => {
  it('defaults to disabled', () => {
    delete process.env.VERCEL_PYTHON_COMPILEALL;
    delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;

    expect(isCompileAllEnabled()).toBe(false);
  });

  it('enables compileall for large functions with truthy flag values', () => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '1';

    process.env.VERCEL_PYTHON_COMPILEALL = '1';
    expect(isCompileAllEnabled()).toBe(true);

    process.env.VERCEL_PYTHON_COMPILEALL = 'true';
    expect(isCompileAllEnabled()).toBe(true);

    process.env.VERCEL_PYTHON_COMPILEALL = 'TRUE';
    expect(isCompileAllEnabled()).toBe(true);
  });

  it('keeps compileall disabled for large functions with non-truthy flag values', () => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '1';

    delete process.env.VERCEL_PYTHON_COMPILEALL;
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_COMPILEALL = '';
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_COMPILEALL = '0';
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_COMPILEALL = 'false';
    expect(isCompileAllEnabled()).toBe(false);
  });

  it('never enables compileall without large functions, even when the flag is truthy', () => {
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '0';
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = 'false';
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '';
    expect(isCompileAllEnabled()).toBe(false);
  });
});

describe('shouldUseCompileAll', () => {
  it('enables compileall for large functions when the flag is set for non-custom builds', () => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '1';
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(
      shouldUseCompileAll({
        isDev: false,
        hasCustomCommand: false,
      })
    ).toBe(true);
  });

  it('does not enable compileall for custom commands, even with large functions and the flag set', () => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '1';
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(
      shouldUseCompileAll({
        isDev: false,
        hasCustomCommand: true,
      })
    ).toBe(false);
  });

  it('does not enable compileall in dev even with large functions and the flag set', () => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '1';
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(
      shouldUseCompileAll({
        isDev: true,
        hasCustomCommand: false,
      })
    ).toBe(false);
  });

  it('does not enable compileall without large functions even when the flag is set', () => {
    delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
    process.env.VERCEL_PYTHON_COMPILEALL = '1';

    expect(
      shouldUseCompileAll({
        isDev: false,
        hasCustomCommand: false,
      })
    ).toBe(false);
  });

  it('does not enable compileall for large functions without the flag', () => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = '1';
    delete process.env.VERCEL_PYTHON_COMPILEALL;

    expect(
      shouldUseCompileAll({
        isDev: false,
        hasCustomCommand: false,
      })
    ).toBe(false);
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
      { env }
    );
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
