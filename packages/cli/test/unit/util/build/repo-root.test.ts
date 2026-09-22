import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'fs/promises';
import execa from 'execa';
import {
  findWorkspaceRootCandidates,
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

  describe('findWorkspaceRootCandidates', () => {
    it('detects a pnpm-workspace.yaml root from a nested app dir', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      expect(findWorkspaceRootCandidates(appDir)).toEqual([
        { dir: root, type: 'pnpm' },
      ]);
    });

    it('detects an npm/yarn `workspaces` array in package.json', async () => {
      const appDir = join(root, 'packages', 'web');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'monorepo', workspaces: ['packages/*'] })
      );

      expect(findWorkspaceRootCandidates(appDir)).toEqual([
        { dir: root, type: 'npm' },
      ]);
    });

    it('detects the `workspaces.packages` object form', async () => {
      const appDir = join(root, 'a', 'b');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ workspaces: { packages: ['a/*'] } })
      );

      expect(findWorkspaceRootCandidates(appDir)).toEqual([
        { dir: root, type: 'npm' },
      ]);
    });

    it('returns nested workspace roots ordered outermost first', async () => {
      // Outer monorepo containing an inner package that is itself a workspace.
      const inner = join(root, 'packages', 'inner');
      const innerApp = join(inner, 'apps', 'svc');
      await mkdirp(innerApp);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ workspaces: ['packages/*'] })
      );
      await writeFile(
        join(inner, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      expect(findWorkspaceRootCandidates(innerApp)).toEqual([
        { dir: root, type: 'npm' },
        { dir: inner, type: 'pnpm' },
      ]);
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

      expect(findWorkspaceRootCandidates(appDir)).toEqual([]);
    });

    it('tolerates a malformed package.json and keeps walking', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(join(appDir, 'package.json'), '{ this is not json');
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      expect(findWorkspaceRootCandidates(appDir)).toEqual([
        { dir: root, type: 'pnpm' },
      ]);
    });

    it('returns an empty list when there is no workspace marker', async () => {
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      expect(findWorkspaceRootCandidates(appDir)).toEqual([]);
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
      // Membership requires the directory to be a real package (mirroring how
      // package managers expand workspace globs against `<dir>/package.json`).
      await writeFile(
        join(appDir, 'package.json'),
        JSON.stringify({ name: 'api' })
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

    it('ignores a redundant rootDirectory that points nowhere and warns (config #4)', async () => {
      // A link at apps/api with rootDirectory "apps/api" would resolve to a
      // non-existent apps/api/apps/api, so it is treated as redundant: build
      // from the link's own location and warn.
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, 'apps/api');
      expect(result.repoRoot).toEqual(root);
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      expect(result.advisory).toMatch(
        /Ignoring "rootDirectory" setting "apps\/api"/
      );
      expect(result.advisory).toMatch(/does not exist/);
    });

    it('honors a deeper rootDirectory when the folder exists', async () => {
      // A link at apps/api with rootDirectory "server" builds apps/api/server
      // when that folder actually exists.
      const appDir = await setupMonorepo();
      await mkdirp(join(appDir, 'server'));
      const result = resolvePerDirectoryLinkRoot(appDir, 'server');
      expect(result.resolvedRootDirectory).toEqual('apps/api/server');
      expect(result.advisory).toBeUndefined();
    });

    it('ignores a deeper rootDirectory that points nowhere and warns', async () => {
      const appDir = await setupMonorepo();
      const result = resolvePerDirectoryLinkRoot(appDir, 'server');
      expect(result.resolvedRootDirectory).toEqual('apps/api');
      expect(result.advisory).toMatch(
        /Ignoring "rootDirectory" setting "server"/
      );
    });

    it('normalizes ./ and trailing slash noise on an existing setting', async () => {
      const appDir = await setupMonorepo();
      await mkdirp(join(appDir, 'server'));
      const result = resolvePerDirectoryLinkRoot(appDir, './server/');
      expect(result.resolvedRootDirectory).toEqual('apps/api/server');
      expect(result.advisory).toBeUndefined();
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

    it('does NOT re-anchor a directory the workspace never claimed', async () => {
      // A project that merely sits inside a workspace (a fixture, a vendored
      // folder) without being one of its member packages must build from its
      // own directory, exactly as before.
      const strayDir = join(root, 'test', 'fixtures', 'my-app');
      await mkdirp(strayDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );
      await writeFile(
        join(strayDir, 'package.json'),
        JSON.stringify({ name: 'my-app' })
      );

      const result = resolvePerDirectoryLinkRoot(strayDir, null);
      expect(result.repoRoot).toEqual(strayDir);
      expect(result.resolvedRootDirectory).toEqual('');
    });

    it('does NOT re-anchor a directory merely nested inside a member package', async () => {
      // Only exact member packages are claimed. A directory under a member
      // (e.g. a fixture inside packages/cli when the workspace declares
      // packages/*) is not itself a workspace package — its dependencies are
      // not hoisted for it — so it builds from its own directory. Deeper
      // builds inside a member are expressed via the link at the member plus
      // the rootDirectory setting, which is covered above.
      const appDir = await setupMonorepo();
      const nestedDir = join(appDir, 'test', 'fixtures', 'sample');
      await mkdirp(nestedDir);
      await writeFile(
        join(nestedDir, 'package.json'),
        JSON.stringify({ name: 'sample' })
      );

      const result = resolvePerDirectoryLinkRoot(nestedDir, null);
      expect(result.repoRoot).toEqual(nestedDir);
      expect(result.resolvedRootDirectory).toEqual('');
    });

    it('does NOT claim a matching directory that is not a real package', async () => {
      // The pattern matches but there is no package.json — package managers
      // would not treat it as a workspace member, so neither do we.
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );

      const result = resolvePerDirectoryLinkRoot(appDir, null);
      expect(result.repoRoot).toEqual(appDir);
      expect(result.resolvedRootDirectory).toEqual('');
    });

    it('respects negated workspace patterns', async () => {
      const appDir = join(root, 'apps', 'legacy');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n  - "!apps/legacy"\n'
      );
      await writeFile(
        join(appDir, 'package.json'),
        JSON.stringify({ name: 'legacy' })
      );

      const result = resolvePerDirectoryLinkRoot(appDir, null);
      expect(result.repoRoot).toEqual(appDir);
      expect(result.resolvedRootDirectory).toEqual('');
    });

    it('matches recursive globs without touching the filesystem tree', async () => {
      // A `**`-style pattern is pure string matching plus one package.json
      // check — no tree traversal, so even a huge node_modules costs nothing.
      const appDir = join(root, 'components', 'deep', 'widget');
      await mkdirp(appDir);
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - components/**\n'
      );
      await writeFile(
        join(appDir, 'package.json'),
        JSON.stringify({ name: 'widget' })
      );

      const result = resolvePerDirectoryLinkRoot(appDir, null);
      expect(result.repoRoot).toEqual(root);
      expect(result.resolvedRootDirectory).toEqual('components/deep/widget');
    });

    it('does NOT re-anchor to a plain git root', async () => {
      // A per-directory link inside a plain git repo (no workspace) has no
      // membership to verify, and no hoisted node_modules above it — leave it
      // untouched.
      const appDir = join(root, 'apps', 'api');
      await mkdirp(appDir);
      await execa('git', ['init'], { cwd: root });

      const result = resolvePerDirectoryLinkRoot(appDir, null);
      expect(result.repoRoot).toEqual(appDir);
      expect(result.resolvedRootDirectory).toEqual('');
    });

    it('anchors to the outermost workspace that claims the directory', async () => {
      // Nested workspaces where BOTH declare the app: the outermost wins,
      // since that is where package managers hoist dependencies.
      const inner = join(root, 'packages', 'inner');
      const innerApp = join(inner, 'apps', 'svc');
      await mkdirp(innerApp);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ workspaces: ['packages/inner/apps/*'] })
      );
      await writeFile(
        join(inner, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );
      await writeFile(
        join(innerApp, 'package.json'),
        JSON.stringify({ name: 'svc' })
      );

      const result = resolvePerDirectoryLinkRoot(innerApp, null);
      expect(result.repoRoot).toEqual(root);
      expect(result.resolvedRootDirectory).toEqual('packages/inner/apps/svc');
    });

    it('falls back to an inner workspace when only it claims the directory', async () => {
      // The outer workspace exists but its patterns do not name the app; the
      // inner workspace claims it, so it becomes the anchor.
      const inner = join(root, 'vendored', 'inner');
      const innerApp = join(inner, 'apps', 'svc');
      await mkdirp(innerApp);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ workspaces: ['packages/*'] })
      );
      await writeFile(
        join(inner, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n'
      );
      await writeFile(
        join(innerApp, 'package.json'),
        JSON.stringify({ name: 'svc' })
      );

      const result = resolvePerDirectoryLinkRoot(innerApp, null);
      expect(result.repoRoot).toEqual(inner);
      expect(result.resolvedRootDirectory).toEqual('apps/svc');
    });
  });
});
