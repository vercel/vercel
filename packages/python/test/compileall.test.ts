import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  default: vi.fn(),
}));

vi.mock('@vercel/build-utils', () => ({
  debug: vi.fn(),
}));

import execa from 'execa';
import {
  derivePycPath,
  isCompileAllEnabled,
  runCompileAll,
} from '../src/compileall';

const mockedExeca = vi.mocked(execa);
const originalCompileAllEnv = process.env.VERCEL_PYTHON_COMPILEALL;

afterEach(() => {
  vi.clearAllMocks();
  if (originalCompileAllEnv === undefined) {
    delete process.env.VERCEL_PYTHON_COMPILEALL;
  } else {
    process.env.VERCEL_PYTHON_COMPILEALL = originalCompileAllEnv;
  }
});

describe('isCompileAllEnabled', () => {
  it('defaults to disabled', () => {
    delete process.env.VERCEL_PYTHON_COMPILEALL;

    expect(isCompileAllEnabled()).toBe(false);
  });

  it('enables compileall for truthy env values', () => {
    process.env.VERCEL_PYTHON_COMPILEALL = '1';
    expect(isCompileAllEnabled()).toBe(true);

    process.env.VERCEL_PYTHON_COMPILEALL = 'true';
    expect(isCompileAllEnabled()).toBe(true);

    process.env.VERCEL_PYTHON_COMPILEALL = 'TRUE';
    expect(isCompileAllEnabled()).toBe(true);
  });

  it('keeps compileall disabled for other env values', () => {
    process.env.VERCEL_PYTHON_COMPILEALL = '';
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_COMPILEALL = '0';
    expect(isCompileAllEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_COMPILEALL = 'false';
    expect(isCompileAllEnabled()).toBe(false);
  });
});

describe('runCompileAll', () => {
  it('passes an exclude regex to compileall when provided', async () => {
    mockedExeca.mockResolvedValue({} as any);
    const env = { VIRTUAL_ENV: '/work/.vercel/python/.venv' };

    await runCompileAll({
      pythonBin: '/work/.vercel/python/.venv/bin/python',
      directories: ['/work'],
      env,
      excludeRegex: '[/\\\\]\\.vercel(?:[/\\\\]|$)',
    });

    expect(mockedExeca).toHaveBeenCalledWith(
      '/work/.vercel/python/.venv/bin/python',
      [
        '-m',
        'compileall',
        '-q',
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
