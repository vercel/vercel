import { describe, it, expect, afterEach } from 'vitest';
import { FileBlob, type Files } from '@vercel/build-utils';
import {
  annotateBytecodeItems,
  fillBytecodeWithinCapacity,
  isBytecodeAnalysisDisabled,
  rankBytecodeItems,
} from '../src/bytecode-packing';
import { moduleKeysForClosurePaths } from '../src/index';
import type { BytecodeItem } from '../src/compileall';
import { join } from 'path';

const MB = 1024 * 1024;

function makeItem(
  bundlePath: string,
  size: number,
  moduleKey?: string,
  sourceAbsPath?: string
): BytecodeItem {
  return {
    bundlePath,
    file: new FileBlob({ data: 'pyc' }) as unknown as BytecodeItem['file'],
    size,
    moduleKey: moduleKey ?? bundlePath,
    sourceAbsPath: sourceAbsPath ?? `/src/${moduleKey ?? bundlePath}`,
  };
}

describe('isBytecodeAnalysisDisabled', () => {
  const original = process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS;
    } else {
      process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS = original;
    }
  });

  it.each(['1', 'true', 'TRUE', 'True'])('is disabled for %j', value => {
    process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS = value;
    expect(isBytecodeAnalysisDisabled()).toBe(true);
  });

  it.each(['', '0', 'false', 'no'])('is enabled for %j', value => {
    process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS = value;
    expect(isBytecodeAnalysisDisabled()).toBe(false);
  });

  it('is enabled when unset', () => {
    delete process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS;
    expect(isBytecodeAnalysisDisabled()).toBe(false);
  });
});

describe('rankBytecodeItems', () => {
  it('ranks imported modules ahead of unimported ones', () => {
    const items = annotateBytecodeItems(
      [
        makeItem('_vendor/huge/__init__.pyc', 25 * MB, 'huge/__init__.py'),
        makeItem('_vendor/small/__init__.pyc', 1 * MB, 'small/__init__.py'),
      ],
      new Set(['small/__init__.py']),
      undefined
    );

    const ranked = rankBytecodeItems(items);
    expect(ranked.map(i => i.bundlePath)).toEqual([
      '_vendor/small/__init__.pyc',
      '_vendor/huge/__init__.pyc',
    ]);
  });

  it('ranks by compile density within a tier, not raw size', () => {
    // twilio-like: 25 MB, cheap per byte. pydantic-like: 5 MB, expensive.
    const items = annotateBytecodeItems(
      [
        makeItem('a.pyc', 25 * MB, 'a.py', '/src/a.py'),
        makeItem('b.pyc', 5 * MB, 'b.py', '/src/b.py'),
      ],
      new Set(['a.py', 'b.py']),
      new Map([
        ['/src/a.py', 0.25], // 0.01 s/MB
        ['/src/b.py', 0.5], // 0.1 s/MB
      ])
    );

    const ranked = rankBytecodeItems(items);
    expect(ranked.map(i => i.bundlePath)).toEqual(['b.pyc', 'a.pyc']);
  });

  it('falls back to per-file size ordering without timings', () => {
    const items = annotateBytecodeItems(
      [makeItem('small.pyc', 1 * MB), makeItem('big.pyc', 10 * MB)],
      undefined,
      undefined
    );

    const ranked = rankBytecodeItems(items);
    expect(ranked.map(i => i.bundlePath)).toEqual(['big.pyc', 'small.pyc']);
  });

  it('ranks items with missing timings at the median density', () => {
    const items = annotateBytecodeItems(
      [
        makeItem('timed-dense.pyc', 10 * MB, 'a.py', '/src/a.py'),
        makeItem('timed-sparse.pyc', 1 * MB, 'b.py', '/src/b.py'),
        makeItem('untimed.pyc', 5 * MB, 'c.py', '/src/c.py'),
      ],
      undefined,
      new Map([
        ['/src/a.py', 10], // 1 s/MB
        ['/src/b.py', 0.001], // 0.001 s/MB
      ])
    );

    // median of [1, 0.001] -> lower-middle element after sort = index 1 of 2?
    // densities sorted: [0.001, 1]; median index = floor(2/2) = 1 -> 1.
    // untimed takes density 1, tying with timed-dense; tie broken by size.
    const ranked = rankBytecodeItems(items);
    expect(ranked.map(i => i.bundlePath)).toEqual([
      'timed-dense.pyc',
      'untimed.pyc',
      'timed-sparse.pyc',
    ]);
  });
});

describe('fillBytecodeWithinCapacity', () => {
  it('fills greedily in rank order and returns the remainder', () => {
    const files: Files = {};
    const items = annotateBytecodeItems(
      [makeItem('a.pyc', 10 * MB), makeItem('b.pyc', 5 * MB)],
      undefined,
      undefined
    );

    const remaining = fillBytecodeWithinCapacity(
      files,
      rankBytecodeItems(items),
      20 * MB
    );
    expect(Object.keys(files)).toEqual(['a.pyc', 'b.pyc']);
    expect(remaining).toBe(5 * MB);
  });

  it('skips items that do not fit and continues with smaller ones', () => {
    const files: Files = {};
    const items = annotateBytecodeItems(
      [makeItem('big.pyc', 10 * MB), makeItem('small.pyc', 4 * MB)],
      undefined,
      undefined
    );

    const remaining = fillBytecodeWithinCapacity(
      files,
      rankBytecodeItems(items),
      5 * MB
    );
    expect(Object.keys(files)).toEqual(['small.pyc']);
    expect(remaining).toBe(1 * MB);
  });

  it('stops at zero remaining capacity', () => {
    const files: Files = {};
    const items = annotateBytecodeItems(
      [makeItem('a.pyc', 3 * MB), makeItem('b.pyc', 3 * MB)],
      undefined,
      undefined
    );

    const remaining = fillBytecodeWithinCapacity(
      files,
      rankBytecodeItems(items),
      3 * MB
    );
    expect(Object.keys(files)).toEqual(['a.pyc']);
    expect(remaining).toBe(0);
  });

  it('ships imported packages partially at per-file granularity', () => {
    // The hubspot argument: a partially-imported package contributes its
    // imported slice, not all-or-nothing.
    const files: Files = {};
    const items = annotateBytecodeItems(
      [
        makeItem('_vendor/sdk/a.pyc', 2 * MB, 'sdk/a.py'),
        makeItem('_vendor/sdk/b.pyc', 2 * MB, 'sdk/b.py'),
        makeItem('_vendor/sdk/generated1.pyc', 8 * MB, 'sdk/generated1.py'),
        makeItem('_vendor/sdk/generated2.pyc', 8 * MB, 'sdk/generated2.py'),
      ],
      new Set(['sdk/a.py', 'sdk/b.py']),
      undefined
    );

    const remaining = fillBytecodeWithinCapacity(
      files,
      rankBytecodeItems(items),
      13 * MB
    );
    expect(Object.keys(files).sort()).toEqual([
      '_vendor/sdk/a.pyc',
      '_vendor/sdk/b.pyc',
      // one generated file fits in the leftover capacity
      '_vendor/sdk/generated1.pyc',
    ]);
    expect(remaining).toBe(1 * MB);
  });
});

describe('moduleKeysForClosurePaths', () => {
  const workPath = join('/work');
  const sitePackages = join('/work/.venv/lib/python3.12/site-packages');

  it('maps app files to workPath-relative keys and vendor files to site-packages-relative keys', () => {
    const keys = moduleKeysForClosurePaths(
      [
        join(workPath, 'main.py'),
        join(workPath, 'routes/users.py'),
        join(sitePackages, 'fastapi/applications.py'),
      ],
      workPath,
      [sitePackages]
    );

    expect([...keys].sort()).toEqual([
      'fastapi/applications.py',
      'main.py',
      'routes/users.py',
    ]);
  });

  it('drops files outside every root (stdlib is never bundled)', () => {
    const keys = moduleKeysForClosurePaths(
      [join('/usr/lib/python3.12/json/__init__.py')],
      workPath,
      [sitePackages]
    );
    expect(keys.size).toBe(0);
  });

  it('maps vendor files to site-packages keys even when the venv is nested under workPath', () => {
    // Production layout: the build venv lives at workPath/.vercel/python/.venv.
    const keys = moduleKeysForClosurePaths(
      [join(sitePackages, 'fastapi/__init__.py'), join(workPath, 'main.py')],
      workPath,
      [sitePackages]
    );
    expect([...keys].sort()).toEqual(['fastapi/__init__.py', 'main.py']);
  });
});
