import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { publicBundlersByInternal } from '../../utils/expand-internal-changesets.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function readWorkspacePackages(dirName) {
  const dir = join(repoRoot, dirName);
  const entries = await readdir(dir, { withFileTypes: true });
  const packages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const pkg = JSON.parse(
        await readFile(join(dir, entry.name, 'package.json'), 'utf8')
      );
      packages.push({ dirName, folder: entry.name, pkg });
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return packages;
}

describe('internal packages', () => {
  it('are versioned by changesets', async () => {
    const changesetConfig = JSON.parse(
      await readFile(join(repoRoot, '.changeset/config.json'), 'utf8')
    );
    expect(changesetConfig.ignore).not.toContain('@vercel-internals/*');
    expect(changesetConfig.privatePackages.version).toBe(true);
  });

  it('are mapped to the public packages that bundle them', async () => {
    const packages = [
      ...(await readWorkspacePackages('packages')).map(({ pkg }) => pkg),
      ...(await readWorkspacePackages('internals')).map(({ pkg }) => pkg),
    ];
    const bundlers = publicBundlersByInternal(packages);

    expect([...bundlers.get('@vercel-internals/runtimes')].sort()).toEqual(
      ['@vercel/fs-detectors', 'vercel'].sort()
    );
    expect([...bundlers.get('@vercel-internals/ipc-proxy')].sort()).toEqual([
      '@vercel/container',
      '@vercel/go',
      '@vercel/rust',
    ]);
    expect(bundlers.has('@vercel-internals/tsconfig')).toBe(false);
  });

  it('are only devDependencies of public packages', async () => {
    const packages = await readWorkspacePackages('packages');
    const violations = [];

    for (const { folder, pkg } of packages) {
      if (pkg.private === true) continue;
      for (const field of ['dependencies', 'peerDependencies']) {
        for (const name of Object.keys(pkg[field] || {})) {
          if (name.startsWith('@vercel-internals/')) {
            violations.push(`${folder} ${field} ${name}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('are private workspace packages', async () => {
    const packages = await readWorkspacePackages('internals');
    expect(packages.length).toBeGreaterThan(0);
    for (const { folder, pkg } of packages) {
      expect(pkg.private, folder).toBe(true);
      expect(pkg.name, folder).toMatch(/^@vercel-internals\//);
    }
  });
});
