import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  FileBlob,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
} from '@vercel/build-utils';
import { generateProjectManifest, diagnostics } from '../src/diagnostics';

const DIAGNOSTICS_PATH = manifestPath('node');

// Minimal NodeVersion shape — only `major` is used by generateProjectManifest
const nodeVersion = { major: 20, range: '20.x', runtime: 'nodejs20.x' } as any;

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-node-diag-test-'));
}

function writePackageJson(dir: string, pkg: object): void {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(pkg, null, 2)
  );
}

function writeNpmLock(dir: string, lock: object): string {
  const lockPath = path.join(dir, 'package-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  return lockPath;
}

function readManifest(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, DIAGNOSTICS_PATH), 'utf-8'));
}

// ─── npm v2/v3 ────────────────────────────────────────────────────────────────

describe('generateProjectManifest — npm v2/v3', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('writes manifest with correct metadata', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const manifest = readManifest(tempDir);
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('node');
  });

  it('classifies direct dep with correct scope, requested, and resolved', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies).toEqual([
      {
        name: 'express',
        type: 'direct',
        scopes: ['prod'],
        requested: '^4.18.0',
        resolved: '4.18.2',
        source: 'registry',
        sourceUrl: 'https://registry.npmjs.org',
      },
    ]);
  });

  it('classifies dev dependency with dev scope', async () => {
    writePackageJson(tempDir, { devDependencies: { vitest: '^2.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/vitest': {
          version: '2.0.1',
          resolved: 'https://registry.npmjs.org/vitest/-/vitest-2.0.1.tgz',
          dev: true,
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const { dependencies } = readManifest(tempDir);
    const dep = dependencies.find((d: any) => d.name === 'vitest');
    expect(dep.type).toBe('direct');
    expect(dep.scopes).toEqual(['dev']);
  });

  it('includes transitive deps', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        },
        'node_modules/accepts': {
          version: '1.3.8',
          resolved: 'https://registry.npmjs.org/accepts/-/accepts-1.3.8.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const { dependencies } = readManifest(tempDir);
    const accepts = dependencies.find((d: any) => d.name === 'accepts');
    expect(accepts.type).toBe('transitive');
    expect(accepts.resolved).toBe('1.3.8');
    expect(accepts.source).toBe('registry');
    expect(accepts.sourceUrl).toBe('https://registry.npmjs.org');
  });

  it('assigns dev scope to transitive dep flagged dev in lockfile', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/foo': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
        },
        'node_modules/bar': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
          dev: true,
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const bar = readManifest(tempDir).dependencies.find(
      (d: any) => d.name === 'bar'
    );
    expect(bar.type).toBe('transitive');
    expect(bar.scopes).toEqual(['dev']);
  });

  it('handles @org/pkg namespaced packages', async () => {
    writePackageJson(tempDir, {
      dependencies: { '@vercel/node': '^3.0.0' },
    });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@vercel/node': {
          version: '3.0.7',
          resolved: 'https://registry.npmjs.org/@vercel/node/-/node-3.0.7.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies).toEqual([
      {
        name: '@vercel/node',
        type: 'direct',
        scopes: ['prod'],
        requested: '^3.0.0',
        resolved: '3.0.7',
        source: 'registry',
        sourceUrl: 'https://registry.npmjs.org',
      },
    ]);
  });

  it('excludes nested node_modules entries', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/foo': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
        },
        'node_modules/foo/node_modules/bar': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('foo');
    expect(names).not.toContain('bar');
  });

  it('excludes symlinked packages (link: true)', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/real': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/real/-/real-1.0.0.tgz',
        },
        'node_modules/workspace-pkg': {
          link: true,
          resolved: '../workspace-pkg',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).not.toContain('workspace-pkg');
  });

  it('excludes packages resolved to local file paths', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/real': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/real/-/real-1.0.0.tgz',
        },
        'node_modules/local-pkg': {
          version: '0.0.1',
          resolved: 'file:../local-pkg',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).not.toContain('local-pkg');
  });

  it('classifies packages resolved from git URLs', async () => {
    writePackageJson(tempDir, {
      dependencies: { mylib: 'github:org/mylib' },
    });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/mylib': {
          version: '1.2.3',
          resolved: 'git+https://github.com/org/mylib.git#abc123',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const dep = readManifest(tempDir).dependencies.find(
      (d: any) => d.name === 'mylib'
    );
    expect(dep.source).toBe('git');
    expect(dep.sourceUrl).toBe('https://github.com/org/mylib.git#abc123');
  });

  it('direct dep in multiple package.json fields gets all scopes', async () => {
    writePackageJson(tempDir, {
      dependencies: { react: '^18.0.0' },
      peerDependencies: { react: '>=17.0.0' },
    });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/react': {
          version: '18.2.0',
          resolved: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 3,
    });

    const dep = readManifest(tempDir).dependencies.find(
      (d: any) => d.name === 'react'
    );
    expect(dep.type).toBe('direct');
    expect(dep.scopes).toEqual(['peer', 'prod']);
  });

  it('handles missing lockfile gracefully', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: undefined,
      lockfileVersion: undefined,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies).toEqual([
      {
        name: 'express',
        type: 'direct',
        scopes: ['prod'],
        requested: '^4.18.0',
        resolved: '',
      },
    ]);
  });

  it('writes no manifest when package.json is not found', async () => {
    // tempDir has no package.json

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: undefined,
      lockfileVersion: undefined,
    });

    expect(fs.existsSync(path.join(tempDir, DIAGNOSTICS_PATH))).toBe(false);
  });
});

// ─── npm v1 ───────────────────────────────────────────────────────────────────

describe('generateProjectManifest — npm v1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves direct and transitive dependencies from v1 lockfile', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 1,
      dependencies: {
        express: {
          version: '4.18.2',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        },
        accepts: {
          version: '1.3.8',
          resolved: 'https://registry.npmjs.org/accepts/-/accepts-1.3.8.tgz',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const { dependencies } = readManifest(tempDir);
    const express = dependencies.find((d: any) => d.name === 'express');
    expect(express.type).toBe('direct');
    expect(express.resolved).toBe('4.18.2');

    const accepts = dependencies.find((d: any) => d.name === 'accepts');
    expect(accepts.type).toBe('transitive');
    expect(accepts.resolved).toBe('1.3.8');
  });

  it('walks nested dependencies in v1 lockfile', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 1,
      dependencies: {
        foo: {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
          dependencies: {
            bar: {
              version: '2.0.0',
              resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
            },
          },
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('foo');
    expect(names).toContain('bar');
  });

  it('deduplicates same package appearing at multiple nesting levels', async () => {
    writePackageJson(tempDir, {
      dependencies: { foo: '^1.0.0', baz: '^1.0.0' },
    });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 1,
      dependencies: {
        foo: {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
          dependencies: {
            bar: {
              version: '2.0.0',
              resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
            },
          },
        },
        baz: {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/baz/-/baz-1.0.0.tgz',
          dependencies: {
            bar: {
              version: '2.0.0',
              resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
            },
          },
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const barEntries = readManifest(tempDir).dependencies.filter(
      (d: any) => d.name === 'bar'
    );
    expect(barEntries).toHaveLength(1);
  });

  it('excludes file: deps from v1 lockfile', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writeNpmLock(tempDir, {
      lockfileVersion: 1,
      dependencies: {
        real: {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/real/-/real-1.0.0.tgz',
        },
        'local-pkg': {
          version: '0.0.1',
          resolved: 'file:../local-pkg',
        },
      },
    });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).not.toContain('local-pkg');
  });
});

// ─── diagnostics callback ─────────────────────────────────────────────────────

describe('diagnostics callback', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('returns manifest FileBlob when present', async () => {
    const manifestFilePath = path.join(tempDir, DIAGNOSTICS_PATH);
    fs.mkdirSync(path.dirname(manifestFilePath), { recursive: true });
    const content = JSON.stringify({ version: '20260304', runtime: 'node' });
    fs.writeFileSync(manifestFilePath, content);

    const files = await diagnostics({ workPath: tempDir } as any);

    expect(files).toHaveProperty(MANIFEST_FILENAME);
    const blob = files[MANIFEST_FILENAME] as FileBlob;
    expect(blob).toBeInstanceOf(FileBlob);
    expect(JSON.parse(blob.data as string)).toEqual({
      version: '20260304',
      runtime: 'node',
    });
  });

  it('returns empty object when no manifest exists', async () => {
    const files = await diagnostics({ workPath: tempDir } as any);
    expect(files).toEqual({});
  });
});
