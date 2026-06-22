import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'fs/promises';
import execa from 'execa';
import {
  resolveRepoRoot,
  findWorkspaceRoot,
  resolvePerDirectoryLinkRoot,
} from '../../../../src/util/build/repo-root';

const mkdirp = (p: string) => mkdir(p, { recursive: true });

describe('repo-root', () => {
  let root: string;

  beforeEach(async () => {
    // realpath so macOS /var -> /private/var symlinks don't break equality.
    root = await realpath(await mkdtemp(join(tmpdir(), 'repo-root-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('findWorkspaceRoot', () => {
    it('detects a pnpm-workspace.yaml root from a nested app dir', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      expect(findWorkspaceRoot(appDir)).toEqual(root);
    });

    it('detects an npm/yarn `workspaces` array in package.json', async () => {
      const appDir = join(root, 'packages', 'web');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'monorepo', workspaces: ['packages/*'] })
      );

      expect(findWorkspaceRoot(appDir)).toEqual(root);
    });

    it('detects the `workspaces.packages` object form', async () => {
      const appDir = join(root, 'a', 'b');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ workspaces: { packages: ['a/*'] } })
      );

      expect(findWorkspaceRoot(appDir)).toEqual(root);
    });

    it('detects lerna.json and rush.json roots', async () => {
      const lernaApp = join(root, 'lerna', 'apps', 'x');
      await mkdirp(lernaApp);
      await writeFile(join(root, 'lerna', 'lerna.json'), '{}');
      expect(findWorkspaceRoot(lernaApp)).toEqual(join(root, 'lerna'));

      const rushApp = join(root, 'rush', 'apps', 'y');
      await mkdirp(rushApp);
      await writeFile(join(root, 'rush', 'rush.json'), '{}');
      expect(findWorkspaceRoot(rushApp)).toEqual(join(root, 'rush'));
    });

    it('returns the HIGHEST workspace root for nested workspaces', async () => {
      // Outer monorepo containing an inner package that is itself a workspace.
      const outer = root;
      const inner = join(root, 'packages', 'inner');
      const innerApp = join(inner, 'apps', 'svc');
      await mkdirp(innerApp);
      await writeFile(
        join(outer, 'package.json'),
        JSON.stringify({ workspaces: ['packages/*'] })
      );
      await writeFile(
        join(inner, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      expect(findWorkspaceRoot(innerApp)).toEqual(outer);
    });

    it('ignores a package.json with no workspaces field', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'not-a-workspace' })
      );
      await writeFile(
        join(appDir, 'package.json'),
        JSON.stringify({ name: 'api' })
      );

      expect(findWorkspaceRoot(appDir)).toBeNull();
    });

    it('tolerates a malformed package.json and keeps walking', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(join(appDir, 'package.json'), '{ this is not json');
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      expect(findWorkspaceRoot(appDir)).toEqual(root);
    });

    it('returns null when there is no workspace marker', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      expect(findWorkspaceRoot(appDir)).toBeNull();
    });
  });

  describe('resolveRepoRoot', () => {
    it('prefers the workspace root over git', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );
      // git root is the same dir here, but workspace detection should win
      // without needing git at all.
      expect(resolveRepoRoot({ cwd: appDir })).toEqual(root);
    });

    it('falls back to the git root when no workspace marker exists', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await execa('git', ['init'], { cwd: root });

      expect(await realpath(resolveRepoRoot({ cwd: appDir }))).toEqual(root);
    });

    it('falls back to cwd when there is neither a workspace nor git', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      // No workspace marker, and tmpdir is not inside a git repo.
      const resolved = resolveRepoRoot({ cwd: appDir });
      expect(resolved).toEqual(appDir);
    });
  });

  describe('resolvePerDirectoryLinkRoot', () => {
    async function setupMonorepo() {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );
      return appDir;
    }

    it('resolves a null rootDirectory to the link location (config #3)', async () => {
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, null);
      expect(result.repoRoot).toEqual(root);
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      expect(result.advisory).toBeUndefined();
    });

    it('absorbs a redundant rootDirectory equal to the location (config #4)', async () => {
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, 'apps/api');
      expect(result.repoRoot).toEqual(root);
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      // Redundant restatement is absorbed silently — no advisory.
      expect(result.advisory).toBeUndefined();
    });

    it('absorbs a redundant rootDirectory with ./ and trailing slash noise', async () => {
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, './apps/api/');
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      expect(result.advisory).toBeUndefined();
    });

    it('ignores a mismatched rootDirectory and returns an advisory', async () => {
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, 'apps/web');
      // Location wins: still resolves to the link's own location.
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      expect(result.advisory).toMatch(
        /Ignoring "rootDirectory" setting "apps\/web"/
      );
      expect(result.advisory).toMatch(/always builds from "apps\/api"/);
    });

    it('treats a deeper rootDirectory as a mismatch (no deeper offset)', async () => {
      // A link at apps/api with rootDirectory "server" does NOT build
      // apps/api/server — the link location is authoritative.
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, 'server');
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      expect(result.advisory).toMatch(
        /Ignoring "rootDirectory" setting "server"/
      );
    });

    it('returns empty resolvedRootDirectory when the link is at the repo root', async () => {
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );
      // Link anchored at the root itself: nothing to re-anchor, setting keeps
      // its normal meaning (handled by the caller's default path).
      const result = resolvePerDirectoryLinkRoot(root, 'apps/api');
      expect(result.resolvedRootDirectory).toEqual('');
      expect(result.advisory).toBeUndefined();
    });
  });
});
