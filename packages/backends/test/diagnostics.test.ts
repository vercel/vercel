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

function writePnpmLock(dir: string, content: string): string {
  const lockPath = path.join(dir, 'pnpm-lock.yaml');
  fs.writeFileSync(lockPath, content);
  return lockPath;
}

function writeYarnLock(dir: string, content: string): string {
  const lockPath = path.join(dir, 'yarn.lock');
  fs.writeFileSync(lockPath, content);
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

// ─── pnpm v9 ──────────────────────────────────────────────────────────────────

describe('generateProjectManifest — pnpm v9', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves direct and transitive deps', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '9.0'

packages:
  express@4.18.2:
    resolution: {integrity: sha512-abc}
  accepts@1.3.8:
    resolution: {integrity: sha512-def}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 9,
    });

    const { dependencies } = readManifest(tempDir);
    const express = dependencies.find((d: any) => d.name === 'express');
    expect(express.type).toBe('direct');
    expect(express.resolved).toBe('4.18.2');

    const accepts = dependencies.find((d: any) => d.name === 'accepts');
    expect(accepts.type).toBe('transitive');
    expect(accepts.resolved).toBe('1.3.8');
  });

  it('handles @org/pkg namespaced packages', async () => {
    writePackageJson(tempDir, { dependencies: { '@vercel/node': '^3.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '9.0'

packages:
  '@vercel/node@3.0.7':
    resolution: {integrity: sha512-abc}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 9,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies).toEqual([
      {
        name: '@vercel/node',
        type: 'direct',
        scopes: ['prod'],
        requested: '^3.0.0',
        resolved: '3.0.7',
      },
    ]);
  });

  it('strips peer dep suffixes from keys', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '9.0'

packages:
  'foo@1.0.0(react@18.0.0)':
    resolution: {integrity: sha512-abc}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 9,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies[0].name).toBe('foo');
    expect(dependencies[0].resolved).toBe('1.0.0');
  });

  it('deduplicates packages with different peer dep variants', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '9.0'

packages:
  'foo@1.0.0(react@17.0.0)':
    resolution: {integrity: sha512-abc}
  'foo@1.0.0(react@18.0.0)':
    resolution: {integrity: sha512-def}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 9,
    });

    const { dependencies } = readManifest(tempDir);
    const fooEntries = dependencies.filter((d: any) => d.name === 'foo');
    expect(fooEntries).toHaveLength(1);
    expect(fooEntries[0].resolved).toBe('1.0.0');
  });

  it('excludes local directory packages', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '9.0'

packages:
  real@1.0.0:
    resolution: {integrity: sha512-abc}
  local-pkg@0.0.1:
    resolution: {directory: ../local-pkg, type: directory}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 9,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('real');
    expect(names).not.toContain('local-pkg');
  });

  it('classifies tarball URL source', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '9.0'

packages:
  express@4.18.2:
    resolution: {integrity: sha512-abc, tarball: https://registry.npmjs.org/express/-/express-4.18.2.tgz}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 9,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.source).toBe('registry');
    expect(dep.sourceUrl).toBe('https://registry.npmjs.org');
  });
});

// ─── pnpm v6 ──────────────────────────────────────────────────────────────────

describe('generateProjectManifest — pnpm v6', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves direct and transitive deps', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '6.0'

packages:
  /express@4.18.2:
    resolution: {integrity: sha512-abc}
  /accepts@1.3.8:
    resolution: {integrity: sha512-def}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 6,
    });

    const { dependencies } = readManifest(tempDir);
    const express = dependencies.find((d: any) => d.name === 'express');
    expect(express.type).toBe('direct');
    expect(express.resolved).toBe('4.18.2');

    const accepts = dependencies.find((d: any) => d.name === 'accepts');
    expect(accepts.type).toBe('transitive');
    expect(accepts.resolved).toBe('1.3.8');
  });

  it('handles @org/pkg namespaced packages', async () => {
    writePackageJson(tempDir, { dependencies: { '@vercel/node': '^3.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '6.0'

packages:
  /@vercel/node@3.0.7:
    resolution: {integrity: sha512-abc}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 6,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies[0].name).toBe('@vercel/node');
    expect(dependencies[0].resolved).toBe('3.0.7');
  });

  it('strips peer dep suffixes from keys', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '6.0'

packages:
  /foo@1.0.0_react@18.0.0:
    resolution: {integrity: sha512-abc}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 6,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies[0].name).toBe('foo');
    expect(dependencies[0].resolved).toBe('1.0.0');
  });

  it('excludes local directory packages', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writePnpmLock(
      tempDir,
      `\
lockfileVersion: '6.0'

packages:
  /real@1.0.0:
    resolution: {integrity: sha512-abc}
  /local-pkg@0.0.1:
    resolution: {directory: ../local-pkg, type: directory}
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'pnpm',
      lockfilePath: lockPath,
      lockfileVersion: 6,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('real');
    expect(names).not.toContain('local-pkg');
  });
});

// ─── yarn v1 ─────────────────────────────────────────────────────────────────

describe('generateProjectManifest — yarn v1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves direct and transitive deps', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
# yarn lockfile v1

express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz#abc"

accepts@^1.3.7:
  version "1.3.8"
  resolved "https://registry.yarnpkg.com/accepts/-/accepts-1.3.8.tgz#def"
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const { dependencies } = readManifest(tempDir);
    const express = dependencies.find((d: any) => d.name === 'express');
    expect(express.type).toBe('direct');
    expect(express.resolved).toBe('4.18.2');
    expect(express.source).toBe('registry');
    expect(express.sourceUrl).toBe('https://registry.yarnpkg.com');

    const accepts = dependencies.find((d: any) => d.name === 'accepts');
    expect(accepts.type).toBe('transitive');
    expect(accepts.resolved).toBe('1.3.8');
  });

  it('handles @org/pkg namespaced packages', async () => {
    writePackageJson(tempDir, { dependencies: { '@vercel/node': '^3.0.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
# yarn lockfile v1

"@vercel/node@^3.0.0":
  version "3.0.7"
  resolved "https://registry.yarnpkg.com/@vercel/node/-/node-3.0.7.tgz#abc"
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies[0].name).toBe('@vercel/node');
    expect(dependencies[0].resolved).toBe('3.0.7');
  });

  it('deduplicates multiple specifiers for the same package', async () => {
    writePackageJson(tempDir, { dependencies: { foo: '^1.0.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
# yarn lockfile v1

foo@^1.0.0, foo@^1.1.0:
  version "1.1.0"
  resolved "https://registry.yarnpkg.com/foo/-/foo-1.1.0.tgz#abc"
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const fooEntries = readManifest(tempDir).dependencies.filter(
      (d: any) => d.name === 'foo'
    );
    expect(fooEntries).toHaveLength(1);
    expect(fooEntries[0].resolved).toBe('1.1.0');
  });

  it('classifies git-resolved packages', async () => {
    writePackageJson(tempDir, { dependencies: { mylib: 'org/mylib' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
# yarn lockfile v1

mylib@org/mylib:
  version "1.2.3"
  resolved "git+https://github.com/org/mylib.git#abc123"
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const dep = readManifest(tempDir).dependencies.find(
      (d: any) => d.name === 'mylib'
    );
    expect(dep.source).toBe('git');
    expect(dep.sourceUrl).toBe('https://github.com/org/mylib.git#abc123');
  });

  it('excludes file: resolved packages', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
# yarn lockfile v1

real@^1.0.0:
  version "1.0.0"
  resolved "https://registry.yarnpkg.com/real/-/real-1.0.0.tgz#abc"

"local-pkg@file:../local-pkg":
  version "0.0.1"
  resolved "file:../local-pkg"
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('real');
    expect(names).not.toContain('local-pkg');
  });
});

// ─── yarn berry ───────────────────────────────────────────────────────────────

describe('generateProjectManifest — yarn berry', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves direct and transitive deps', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
__metadata:
  version: 8
  cacheKey: 10c0

"express@npm:^4.18.0":
  version: 4.18.2
  resolution: "express@npm:4.18.2"
  languageName: node
  linkType: hard

"accepts@npm:^1.3.7":
  version: 1.3.8
  resolution: "accepts@npm:1.3.8"
  languageName: node
  linkType: hard
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 8,
    });

    const { dependencies } = readManifest(tempDir);
    const express = dependencies.find((d: any) => d.name === 'express');
    expect(express.type).toBe('direct');
    expect(express.resolved).toBe('4.18.2');

    const accepts = dependencies.find((d: any) => d.name === 'accepts');
    expect(accepts.type).toBe('transitive');
    expect(accepts.resolved).toBe('1.3.8');
  });

  it('handles @org/pkg namespaced packages', async () => {
    writePackageJson(tempDir, { dependencies: { '@vercel/node': '^3.0.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
__metadata:
  version: 8

"@vercel/node@npm:^3.0.0":
  version: 3.0.7
  resolution: "@vercel/node@npm:3.0.7"
  languageName: node
  linkType: hard
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 8,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies[0].name).toBe('@vercel/node');
    expect(dependencies[0].resolved).toBe('3.0.7');
  });

  it('excludes workspace packages (linkType: soft)', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = writeYarnLock(
      tempDir,
      `\
__metadata:
  version: 8

"real@npm:^1.0.0":
  version: 1.0.0
  resolution: "real@npm:1.0.0"
  languageName: node
  linkType: hard

"local-pkg@workspace:packages/local-pkg":
  version: 0.0.0-use.local
  resolution: "local-pkg@workspace:packages/local-pkg"
  languageName: unknown
  linkType: soft
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'yarn',
      lockfilePath: lockPath,
      lockfileVersion: 8,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('real');
    expect(names).not.toContain('local-pkg');
  });
});

// ─── bun text ─────────────────────────────────────────────────────────────────

describe('generateProjectManifest — bun text (bun.lock)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves direct and transitive deps', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.18.0' } });
    const lockPath = path.join(tempDir, 'bun.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 0,
        packages: {
          express: ['express@4.18.2', {}, 'hash'],
          accepts: ['accepts@1.3.8', {}, 'hash'],
        },
      })
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'bun',
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

  it('handles @org/pkg namespaced packages', async () => {
    writePackageJson(tempDir, { dependencies: { '@vercel/node': '^3.0.0' } });
    const lockPath = path.join(tempDir, 'bun.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 0,
        packages: {
          '@vercel/node': ['@vercel/node@3.0.7', {}, 'hash'],
        },
      })
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'bun',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies[0].name).toBe('@vercel/node');
    expect(dependencies[0].resolved).toBe('3.0.7');
  });

  it('excludes file: and workspace: linked packages', async () => {
    writePackageJson(tempDir, { dependencies: { real: '^1.0.0' } });
    const lockPath = path.join(tempDir, 'bun.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 0,
        packages: {
          real: ['real@1.0.0', {}, 'hash'],
          'local-pkg': ['local-pkg@file:../local-pkg', {}, null],
          'workspace-pkg': [
            'workspace-pkg@workspace:packages/workspace-pkg',
            {},
            null,
          ],
        },
      })
    );

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'bun',
      lockfilePath: lockPath,
      lockfileVersion: 1,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('real');
    expect(names).not.toContain('local-pkg');
    expect(names).not.toContain('workspace-pkg');
  });
});

// ─── bun binary fallback ──────────────────────────────────────────────────────

describe('generateProjectManifest — bun binary (bun.lockb)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('emits direct deps with empty resolved, no transitive', async () => {
    writePackageJson(tempDir, {
      dependencies: { express: '^4.18.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    // Content is irrelevant — binary lockfiles are never read
    const lockPath = path.join(tempDir, 'bun.lockb');
    fs.writeFileSync(lockPath, Buffer.from([0x00, 0x01, 0x02]));

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'bun',
      lockfilePath: lockPath,
      lockfileVersion: 0,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies.every((d: any) => d.type === 'direct')).toBe(true);
    expect(dependencies.every((d: any) => d.resolved === '')).toBe(true);

    const names = dependencies.map((d: any) => d.name);
    expect(names).toContain('express');
    expect(names).toContain('vitest');
  });
});

// ─── vlt fallback ────────────────────────────────────────────────────────────

describe('generateProjectManifest — vlt fallback', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('emits direct deps with empty resolved, no transitive', async () => {
    writePackageJson(tempDir, {
      dependencies: { express: '^4.18.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    // File is never read — vlt format is undocumented
    const lockPath = path.join(tempDir, 'vlt-lock.json');

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'vlt',
      lockfilePath: lockPath,
      lockfileVersion: undefined,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies.every((d: any) => d.type === 'direct')).toBe(true);
    expect(dependencies.every((d: any) => d.resolved === '')).toBe(true);

    const names = dependencies.map((d: any) => d.name);
    expect(names).toContain('express');
    expect(names).toContain('vitest');
  });
});

// ─── runtimeVersion ───────────────────────────────────────────────────────────

describe('runtimeVersion', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  async function getVersion(dir: string) {
    await generateProjectManifest({
      workPath: dir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: undefined,
      lockfileVersion: undefined,
    });
    return readManifest(dir).runtimeVersion;
  }

  it('resolved comes from nodeVersion.major', async () => {
    writePackageJson(tempDir, {});
    const rv = await getVersion(tempDir);
    expect(rv.resolved).toBe('20');
  });

  it('reads requested from engines.node in package.json', async () => {
    writePackageJson(tempDir, { engines: { node: '>=20.0.0' } });
    const rv = await getVersion(tempDir);
    expect(rv.requested).toBe('>=20.0.0');
    expect(rv.requestedSource).toBe('package.json');
  });

  it('reads requested from .node-version when no engines.node', async () => {
    writePackageJson(tempDir, {});
    fs.writeFileSync(path.join(tempDir, '.node-version'), '20.11.0\n');
    const rv = await getVersion(tempDir);
    expect(rv.requested).toBe('20.11.0');
    expect(rv.requestedSource).toBe('.node-version');
  });

  it('reads requested from .nvmrc when no engines.node or .node-version', async () => {
    writePackageJson(tempDir, {});
    fs.writeFileSync(path.join(tempDir, '.nvmrc'), 'lts/iron\n');
    const rv = await getVersion(tempDir);
    expect(rv.requested).toBe('lts/iron');
    expect(rv.requestedSource).toBe('.nvmrc');
  });

  it('engines.node takes priority over .node-version', async () => {
    writePackageJson(tempDir, { engines: { node: '>=20.0.0' } });
    fs.writeFileSync(path.join(tempDir, '.node-version'), '18.0.0');
    const rv = await getVersion(tempDir);
    expect(rv.requested).toBe('>=20.0.0');
    expect(rv.requestedSource).toBe('package.json');
  });

  it('.node-version takes priority over .nvmrc', async () => {
    writePackageJson(tempDir, {});
    fs.writeFileSync(path.join(tempDir, '.node-version'), '20.11.0');
    fs.writeFileSync(path.join(tempDir, '.nvmrc'), '18.0.0');
    const rv = await getVersion(tempDir);
    expect(rv.requested).toBe('20.11.0');
    expect(rv.requestedSource).toBe('.node-version');
  });

  it('omits requested when none of the sources are present', async () => {
    writePackageJson(tempDir, {});
    const rv = await getVersion(tempDir);
    expect(rv).toEqual({ resolved: '20' });
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

// ─── framework field ──────────────────────────────────────────────────────────

describe('generateProjectManifest — framework field', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('includes framework in manifest when provided', async () => {
    writePackageJson(tempDir, { dependencies: { hono: '^4.0.0' } });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: undefined,
      lockfileVersion: undefined,
      framework: 'hono',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBe('hono');
  });

  it('omits framework from manifest when not provided', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.0.0' } });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: undefined,
      lockfileVersion: undefined,
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBeUndefined();
  });

  it('omits framework from manifest when empty string provided', async () => {
    writePackageJson(tempDir, { dependencies: { express: '^4.0.0' } });

    await generateProjectManifest({
      workPath: tempDir,
      nodeVersion,
      cliType: 'npm',
      lockfilePath: undefined,
      lockfileVersion: undefined,
      framework: '',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBeUndefined();
  });
});
