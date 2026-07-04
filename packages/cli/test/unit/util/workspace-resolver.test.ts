import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import {
  resolveWorkspaceProject,
  clearWorkspaceResolverCache,
} from '../../../src/util/workspace-resolver';

function createDir(...segments: string[]): string {
  const dir = join(...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJSON(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function writeText(path: string, content: string): void {
  writeFileSync(path, content);
}

describe('resolveWorkspaceProject', () => {
  let repoRoot: string;

  beforeEach(() => {
    clearWorkspaceResolverCache();
    repoRoot = mkdtempSync(join(tmpdir(), 'vc-test-workspace-'));
    // Create .git to mark as repo root
    createDir(repoRoot, '.git');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // 1. Vercel repo link resolution (.vercel/repo.json)
  // -----------------------------------------------------------------------

  describe('Vercel repo link (.vercel/repo.json)', () => {
    it('should resolve a project from repo.json by name', async () => {
      const vercelDir = createDir(repoRoot, '.vercel');
      createDir(repoRoot, 'apps', 'my-app');
      writeJSON(join(vercelDir, 'repo.json'), {
        remoteName: 'origin',
        projects: [
          { id: 'prj_1', name: 'my-app', directory: 'apps/my-app' },
          { id: 'prj_2', name: 'admin', directory: 'apps/admin' },
        ],
      });

      const result = await resolveWorkspaceProject(repoRoot, 'my-app');
      expect(result.projectName).toBe('my-app');
      expect(result.projectPath).toBe(join(repoRoot, 'apps', 'my-app'));
      expect(result.source).toBe('vercel-link');
    });

    it('should not match a different project name', async () => {
      const vercelDir = createDir(repoRoot, '.vercel');
      writeJSON(join(vercelDir, 'repo.json'), {
        remoteName: 'origin',
        projects: [{ id: 'prj_1', name: 'my-app', directory: 'apps/my-app' }],
      });

      // No conventional dirs either — should throw
      await expect(
        resolveWorkspaceProject(repoRoot, 'nonexistent')
      ).rejects.toThrow('Could not find project "nonexistent"');
    });
  });

  // -----------------------------------------------------------------------
  // 2. pnpm workspace resolution
  // -----------------------------------------------------------------------

  describe('pnpm workspaces (pnpm-workspace.yaml)', () => {
    it('should resolve a project by package.json name', async () => {
      writeText(
        join(repoRoot, 'pnpm-workspace.yaml'),
        `packages:\n  - 'apps/*'\n  - 'packages/*'\n`
      );

      const appDir = createDir(repoRoot, 'apps', 'web');
      writeJSON(join(appDir, 'package.json'), { name: 'web' });

      const result = await resolveWorkspaceProject(repoRoot, 'web');
      expect(result.projectName).toBe('web');
      expect(result.projectPath).toBe(appDir);
      expect(result.source).toBe('pnpm');
    });

    it('should resolve a scoped package by unscoped name', async () => {
      writeText(
        join(repoRoot, 'pnpm-workspace.yaml'),
        `packages:\n  - 'packages/*'\n`
      );

      const pkgDir = createDir(repoRoot, 'packages', 'shared');
      writeJSON(join(pkgDir, 'package.json'), { name: '@acme/shared' });

      const result = await resolveWorkspaceProject(repoRoot, 'shared');
      expect(result.projectName).toBe('@acme/shared');
      expect(result.projectPath).toBe(pkgDir);
      expect(result.source).toBe('pnpm');
    });

    it('should resolve a scoped package by full scoped name', async () => {
      writeText(
        join(repoRoot, 'pnpm-workspace.yaml'),
        `packages:\n  - 'packages/*'\n`
      );

      const pkgDir = createDir(repoRoot, 'packages', 'shared');
      writeJSON(join(pkgDir, 'package.json'), { name: '@acme/shared' });

      const result = await resolveWorkspaceProject(repoRoot, '@acme/shared');
      expect(result.projectName).toBe('@acme/shared');
      expect(result.projectPath).toBe(pkgDir);
      expect(result.source).toBe('pnpm');
    });
  });

  // -----------------------------------------------------------------------
  // 3. npm / yarn workspace resolution
  // -----------------------------------------------------------------------

  describe('npm/yarn workspaces (package.json)', () => {
    it('should resolve from package.json workspaces array', async () => {
      writeJSON(join(repoRoot, 'package.json'), {
        name: 'monorepo',
        workspaces: ['apps/*', 'packages/*'],
      });

      const appDir = createDir(repoRoot, 'apps', 'dashboard');
      writeJSON(join(appDir, 'package.json'), { name: 'dashboard' });

      const result = await resolveWorkspaceProject(repoRoot, 'dashboard');
      expect(result.projectName).toBe('dashboard');
      expect(result.projectPath).toBe(appDir);
      expect(result.source).toBe('npm');
    });

    it('should resolve from yarn workspaces.packages object', async () => {
      writeJSON(join(repoRoot, 'package.json'), {
        name: 'monorepo',
        workspaces: { packages: ['apps/*'] },
      });

      const appDir = createDir(repoRoot, 'apps', 'store');
      writeJSON(join(appDir, 'package.json'), { name: 'store' });

      const result = await resolveWorkspaceProject(repoRoot, 'store');
      expect(result.projectName).toBe('store');
      expect(result.projectPath).toBe(appDir);
      expect(result.source).toBe('npm');
    });

    it('should detect yarn source when yarn.lock exists', async () => {
      writeJSON(join(repoRoot, 'package.json'), {
        name: 'monorepo',
        workspaces: ['apps/*'],
      });
      writeText(join(repoRoot, 'yarn.lock'), '');

      const blogDir = createDir(repoRoot, 'apps', 'blog');
      writeJSON(join(blogDir, 'package.json'), { name: 'blog' });

      const result = await resolveWorkspaceProject(repoRoot, 'blog');
      expect(result.source).toBe('yarn');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Conventional directory resolution
  // -----------------------------------------------------------------------

  describe('conventional directories', () => {
    it('should resolve from apps/ directory', async () => {
      const appDir = createDir(repoRoot, 'apps', 'my-app');

      const result = await resolveWorkspaceProject(repoRoot, 'my-app');
      expect(result.projectName).toBe('my-app');
      expect(result.projectPath).toBe(appDir);
      expect(result.source).toBe('conventional');
    });

    it('should resolve from packages/ directory', async () => {
      const pkgDir = createDir(repoRoot, 'packages', 'utils');

      const result = await resolveWorkspaceProject(repoRoot, 'utils');
      expect(result.projectName).toBe('utils');
      expect(result.projectPath).toBe(pkgDir);
      expect(result.source).toBe('conventional');
    });

    it('should resolve from repo root subdirectory', async () => {
      const subDir = createDir(repoRoot, 'my-service');

      const result = await resolveWorkspaceProject(repoRoot, 'my-service');
      expect(result.projectName).toBe('my-service');
      expect(result.projectPath).toBe(subDir);
      expect(result.source).toBe('conventional');
    });

    it('should not resolve .vercel or node_modules as projects', async () => {
      createDir(repoRoot, '.vercel');
      createDir(repoRoot, 'node_modules');

      await expect(
        resolveWorkspaceProject(repoRoot, '.vercel')
      ).rejects.toThrow('Could not find project ".vercel"');

      await expect(
        resolveWorkspaceProject(repoRoot, 'node_modules')
      ).rejects.toThrow('Could not find project "node_modules"');
    });
  });

  // -----------------------------------------------------------------------
  // Priority order
  // -----------------------------------------------------------------------

  describe('resolution priority', () => {
    it('should prefer Vercel repo link over workspace config', async () => {
      // Set up both repo.json and pnpm-workspace.yaml
      const vercelDir = createDir(repoRoot, '.vercel');
      writeJSON(join(vercelDir, 'repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: 'prj_1',
            name: 'my-app',
            directory: 'apps/my-vercel-app',
          },
        ],
      });

      writeText(
        join(repoRoot, 'pnpm-workspace.yaml'),
        `packages:\n  - 'apps/*'\n`
      );
      const pnpmDir = createDir(repoRoot, 'apps', 'my-app');
      writeJSON(join(pnpmDir, 'package.json'), { name: 'my-app' });

      const result = await resolveWorkspaceProject(repoRoot, 'my-app');
      // Should use vercel-link, not pnpm
      expect(result.source).toBe('vercel-link');
      expect(result.projectPath).toBe(join(repoRoot, 'apps', 'my-vercel-app'));
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  describe('error cases', () => {
    it('should throw a descriptive error when project is not found', async () => {
      await expect(
        resolveWorkspaceProject(repoRoot, 'does-not-exist')
      ).rejects.toThrow(/Could not find project "does-not-exist"/);
    });

    it('should include search locations in error message', async () => {
      try {
        await resolveWorkspaceProject(repoRoot, 'missing');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        const msg = (err as Error).message;
        expect(msg).toContain('.vercel/repo.json');
        expect(msg).toContain('pnpm-workspace.yaml');
        expect(msg).toContain('package.json workspaces');
        expect(msg).toContain('Conventional directories');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Caching
  // -----------------------------------------------------------------------

  describe('caching', () => {
    it('should return cached results for the same repo root', async () => {
      const appDir = createDir(repoRoot, 'apps', 'cached-app');

      const result1 = await resolveWorkspaceProject(repoRoot, 'cached-app');
      expect(result1.projectPath).toBe(appDir);

      // Remove the directory — cached result should still return
      rmSync(appDir, { recursive: true, force: true });

      const result2 = await resolveWorkspaceProject(repoRoot, 'cached-app');
      expect(result2.projectPath).toBe(appDir);
    });

    it('should return fresh results after clearing cache', async () => {
      const appDir = createDir(repoRoot, 'apps', 'fresh-app');

      await resolveWorkspaceProject(repoRoot, 'fresh-app');
      clearWorkspaceResolverCache();

      // Remove the directory — without cache, it should throw
      rmSync(appDir, { recursive: true, force: true });

      await expect(
        resolveWorkspaceProject(repoRoot, 'fresh-app')
      ).rejects.toThrow();
    });
  });
});
