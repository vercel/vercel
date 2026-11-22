import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { checkUvBinaryVersion, MIN_UV_VERSION, UV_VERSION } from '../src/uv';

const isWin = process.platform === 'win32';

/**
 * Write a fake `uv` executable into `dir` that prints `versionOutput` for
 * `uv --version`, mirroring the real CLI's `uv X.Y.Z (<hash> <date>)` format.
 */
function makeFakeUv(dir: string, versionOutput: string): string {
  const uvBin = path.join(dir, `uv${isWin ? '.cmd' : ''}`);
  if (isWin) {
    fs.writeFileSync(uvBin, `@echo off\r\necho ${versionOutput}\r\n`, 'utf8');
  } else {
    fs.writeFileSync(uvBin, `#!/bin/sh\necho "${versionOutput}"\n`, 'utf8');
    fs.chmodSync(uvBin, 0o755);
  }
  return uvBin;
}

describe('checkUvBinaryVersion', () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(
      tmpdir(),
      `vc-test-uvver-${Math.floor(Math.random() * 1e6)}`
    );
    fs.mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    fs.removeSync(dir);
  });

  it('throws when uv is older than the minimum', () => {
    const uvBin = makeFakeUv(dir, 'uv 0.9.0 (abcdef0 2025-12-01)');
    expect(() => checkUvBinaryVersion(uvBin)).toThrow(
      `requires uv ${MIN_UV_VERSION} or newer`
    );
  });

  it('throws a NowBuildError with code UV_VERSION_TOO_OLD', () => {
    const uvBin = makeFakeUv(dir, 'uv 0.8.4 (abcdef0 2025-07-30)');
    expect.assertions(1);
    try {
      checkUvBinaryVersion(uvBin);
    } catch (err) {
      expect((err as { code?: string }).code).toBe('UV_VERSION_TOO_OLD');
    }
  });

  it('passes when uv exactly equals the minimum', () => {
    const uvBin = makeFakeUv(dir, `uv ${MIN_UV_VERSION} (abcdef0 2026-01-13)`);
    expect(() => checkUvBinaryVersion(uvBin)).not.toThrow();
  });

  it('returns the version output for a supported uv (UV_VERSION)', () => {
    const out = `uv ${UV_VERSION} (abcdef0 2026-04-27)`;
    const uvBin = makeFakeUv(dir, out);
    expect(checkUvBinaryVersion(uvBin)).toBe(out);
  });

  it('compares numerically, not lexically (0.10.0 >= 0.9.25)', () => {
    const uvBin = makeFakeUv(dir, 'uv 0.10.0 (abcdef0 2026-02-01)');
    expect(() => checkUvBinaryVersion(uvBin)).not.toThrow();
  });

  it('throws when the uv version cannot be determined', () => {
    const uvBin = makeFakeUv(dir, 'uv built from source');
    expect(() => checkUvBinaryVersion(uvBin)).toThrow(
      'Could not determine the uv version'
    );
  });

  it('throws when uv --version cannot be run', () => {
    expect(() =>
      checkUvBinaryVersion(path.join(dir, 'does-not-exist-uv'))
    ).toThrow('could not run "uv --version"');
  });
});
