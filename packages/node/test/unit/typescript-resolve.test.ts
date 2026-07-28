import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveTypescript,
  shouldUseNativeTypecheck,
} from '../../src/typescript-resolve';

describe('resolveTypescript / TypeScript 7', () => {
  let root: string;
  const prevNativeFlag = process.env.VERCEL_NODE_NATIVE_TYPECHECK;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `vercel-node-ts-resolve-${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
    );
    mkdirSync(root, { recursive: true });
    delete process.env.VERCEL_NODE_NATIVE_TYPECHECK;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (prevNativeFlag === undefined) {
      delete process.env.VERCEL_NODE_NATIVE_TYPECHECK;
    } else {
      process.env.VERCEL_NODE_NATIVE_TYPECHECK = prevNativeFlag;
    }
  });

  function writeFakeTypescript(
    dir: string,
    version: string,
    opts: { withApi?: boolean; withBin?: boolean } = {}
  ) {
    const { withApi = true, withBin = true } = opts;
    const pkgDir = join(dir, 'node_modules', 'typescript');
    mkdirSync(join(pkgDir, 'lib'), { recursive: true });
    if (withBin) {
      mkdirSync(join(pkgDir, 'bin'), { recursive: true });
      writeFileSync(join(pkgDir, 'bin', 'tsc'), '#!/bin/sh\necho fake-tsc\n', {
        mode: 0o755,
      });
    }
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'typescript', version, main: 'lib/typescript.js' })
    );
    if (withApi) {
      writeFileSync(
        join(pkgDir, 'lib', 'typescript.js'),
        `module.exports = { version: ${JSON.stringify(version)}, createLanguageService: () => ({}), sys: {} };\n`
      );
    } else {
      // Mimic TypeScript 7's main export (version only).
      writeFileSync(
        join(pkgDir, 'lib', 'typescript.js'),
        `module.exports = { version: ${JSON.stringify(version)}, versionMajorMinor: ${JSON.stringify(version.split('.').slice(0, 2).join('.'))} };\n`
      );
      writeFileSync(
        join(pkgDir, 'lib', 'version.cjs'),
        `module.exports = { version: ${JSON.stringify(version)}, versionMajorMinor: ${JSON.stringify(version.split('.').slice(0, 2).join('.'))} };\n`
      );
    }
    return join(pkgDir, 'lib', 'typescript.js');
  }

  test('uses user TypeScript 5.x as the Compiler API module', () => {
    writeFakeTypescript(root, '5.9.3');
    const resolved = resolveTypescript({ projectPath: root });
    expect(resolved.userIsNative).toBe(false);
    expect(resolved.apiVersion).toBe('5.9.3');
    expect(resolved.apiModulePath).toContain(
      join('node_modules', 'typescript')
    );
    expect(shouldUseNativeTypecheck(resolved, {})).toBe(false);
  });

  test('does not require() user TypeScript 7 as the Compiler API', () => {
    writeFakeTypescript(root, '7.0.2', { withApi: false, withBin: true });
    const resolved = resolveTypescript({ projectPath: root });
    expect(resolved.userIsNative).toBe(true);
    expect(resolved.nativeVersion).toBe('7.0.2');
    expect(resolved.nativeTscPath).toMatch(/bin[/\\]tsc$/);
    // API module must be the built-in ≤6 package, not the user's TS7 stub.
    expect(resolved.apiModulePath).not.toContain(root);
    expect(Number(resolved.apiVersion.split('.')[0])).toBeLessThan(7);
    expect(shouldUseNativeTypecheck(resolved, {})).toBe(true);
  });

  test('VERCEL_NODE_NATIVE_TYPECHECK=1 enables shipped native typecheck', () => {
    // No user typescript — rely on built-in API + optional @typescript/native.
    const resolved = resolveTypescript({ projectPath: root });
    expect(resolved.userIsNative).toBe(false);
    expect(Number(resolved.apiVersion.split('.')[0])).toBeLessThan(7);

    if (!resolved.nativeTscPath) {
      // Dependency may not be linked in some install layouts; skip assertion.
      expect(
        existsSync(join(__dirname, '../../node_modules/@typescript'))
      ).toBe(false);
      return;
    }

    expect(
      shouldUseNativeTypecheck(resolved, { VERCEL_NODE_NATIVE_TYPECHECK: '1' })
    ).toBe(true);
    expect(
      shouldUseNativeTypecheck(resolved, { VERCEL_NODE_NATIVE_TYPECHECK: '0' })
    ).toBe(false);
    expect(shouldUseNativeTypecheck(resolved, {})).toBe(false);
  });

  test('user TypeScript 7 can be forced off native typecheck', () => {
    writeFakeTypescript(root, '7.0.2', { withApi: false, withBin: true });
    const resolved = resolveTypescript({ projectPath: root });
    expect(
      shouldUseNativeTypecheck(resolved, { VERCEL_NODE_NATIVE_TYPECHECK: '0' })
    ).toBe(false);
  });
});
