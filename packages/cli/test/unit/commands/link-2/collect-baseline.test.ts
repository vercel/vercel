import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { cpSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import type { Framework } from '@vercel/frameworks';
import {
  collectLinkBaseline,
  type LinkBaseline,
  type ProjectJsonEntry,
} from '../../../../src/util/link/collect-link-baseline';

const FIXTURES_DIR = join(__dirname, 'fixtures');

/**
 * Copy a fixture into a new tmp dir so detection runs in isolation (true monorepo detection).
 */
function copyFixtureToTmp(fixtureName: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'link-2-collect-'));
  cpSync(join(FIXTURES_DIR, fixtureName), tmpDir, { recursive: true });
  return tmpDir;
}

/** Normalize detectedProjects map to a stable, comparable shape. */
function normalizedDetected(
  m: Map<string, Framework[]>
): Array<[string, string[]]> {
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, fws]) => [dir, fws.map(f => (f.slug as string) ?? '')]);
}

/** Normalize projectJsonFiles for stable assertion (sort by projectRoot). */
function normalizedProjectJsonFiles(entries: ProjectJsonEntry[]) {
  return [...entries]
    .sort((a, b) => a.projectRoot.localeCompare(b.projectRoot))
    .map(e => ({
      projectRoot: e.projectRoot,
      filePath: e.filePath,
      hasIds: !!(e.content.projectId && e.content.orgId),
      projectId: e.content.projectId,
      projectName: e.content.projectName,
    }));
}

/** Snapshot-friendly shape of LinkBaseline for assertions. */
function baselineShape(b: LinkBaseline) {
  return {
    cwd: b.cwd,
    rootPath: b.rootPath !== undefined ? '<defined>' : undefined,
    detectedProjects: normalizedDetected(b.detectedProjects),
    repoJson: b.repoJson
      ? {
          remoteName: b.repoJson.remoteName,
          projectCount: b.repoJson.projects?.length ?? 0,
          directories: b.repoJson.projects?.map(p => p.directory).sort() ?? [],
        }
      : null,
    projectJsonFiles: normalizedProjectJsonFiles(b.projectJsonFiles),
    repo: b.repo === null ? null : `${b.repo.length} project(s)`,
    potentialProjects: b.potentialProjects.length,
  };
}

describe('collectLinkBaseline()', () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tmpDirs = [];
  });

  it('returns empty baseline when cwd is not in a repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'link-2-no-repo-'));
    tmpDirs.push(dir);
    const baseline = await collectLinkBaseline(dir);
    expect(baseline.cwd).toBe(dir);
    expect(baseline.rootPath).toBeUndefined();
    expect(baseline.detectedProjects.size).toBe(0);
    expect(baseline.repoJson).toBeNull();
    expect(baseline.projectJsonFiles).toEqual([]);
    expect(baseline.repo).toBeNull();
    expect(baseline.potentialProjects).toEqual([]);
  });

  it('collects monorepo with repo.json and one project.json (fixture: monorepo-linked)', async () => {
    const tmpDir = copyFixtureToTmp('monorepo-linked');
    tmpDirs.push(tmpDir);
    const baseline = await collectLinkBaseline(tmpDir);
    expect(baseline.cwd).toBe(tmpDir);
    expect(baseline.rootPath).toBe(tmpDir);
    expect(normalizedDetected(baseline.detectedProjects)).toEqual([
      ['apps/web', ['nextjs']],
    ]);
    expect(baseline.repoJson).not.toBeNull();
    expect(baseline.repoJson?.remoteName).toBe('origin');
    expect(baseline.repoJson?.projects).toHaveLength(1);
    expect(baseline.repoJson?.projects?.[0].directory).toBe('apps/web');
    expect(baseline.projectJsonFiles).toHaveLength(1);
    expect(baseline.projectJsonFiles[0].projectRoot).toBe('apps/web');
    expect(baseline.projectJsonFiles[0].content.projectId).toBe('proj_web_123');
    expect(baseline.projectJsonFiles[0].content.orgId).toBe('team_abc');
    expect(baseline.repo).toBeNull();
    expect(baseline.potentialProjects).toEqual([]);
  });

  it('collects single-app at root with repo.json and project.json (fixture: single-app)', async () => {
    const tmpDir = copyFixtureToTmp('single-app');
    tmpDirs.push(tmpDir);
    const baseline = await collectLinkBaseline(tmpDir);
    expect(baseline.rootPath).toBe(tmpDir);
    expect(normalizedDetected(baseline.detectedProjects)).toEqual([
      ['', ['nextjs']],
    ]);
    expect(baseline.repoJson?.projects).toHaveLength(1);
    expect(baseline.repoJson?.projects?.[0].directory).toBe('.');
    expect(baseline.projectJsonFiles).toHaveLength(1);
    expect(baseline.projectJsonFiles[0].projectRoot).toBe('.');
    expect(baseline.projectJsonFiles[0].content.projectId).toBe('proj_root_456');
    expect(baseline.repo).toBeNull();
    expect(baseline.potentialProjects).toEqual([]);
  });

  it('collects repo with partial project.json (settings only, no ids) (fixture: monorepo-partial-project-json)', async () => {
    const tmpDir = copyFixtureToTmp('monorepo-partial-project-json');
    tmpDirs.push(tmpDir);
    const baseline = await collectLinkBaseline(tmpDir);
    expect(baseline.rootPath).toBe(tmpDir);
    expect(normalizedDetected(baseline.detectedProjects)).toEqual([
      ['apps/web', ['nextjs']],
    ]);
    expect(baseline.repoJson?.projects).toHaveLength(2);
    const projectRoots = baseline.projectJsonFiles.map(e => e.projectRoot).sort();
    expect(projectRoots).toEqual(['apps/api', 'apps/web']);
    const withIds = baseline.projectJsonFiles.find(
      e => e.content.projectId && e.content.orgId
    );
    const withoutIds = baseline.projectJsonFiles.find(
      e => !e.content.projectId || !e.content.orgId
    );
    expect(withIds?.projectRoot).toBe('apps/web');
    expect(withoutIds?.projectRoot).toBe('apps/api');
    expect(withoutIds?.content.buildCommand).toBe('npm run build');
    expect(baseline.repo).toBeNull();
    expect(baseline.potentialProjects).toEqual([]);
  });

  it('returns same collection shape when run from subdir of repo', async () => {
    const tmpDir = copyFixtureToTmp('monorepo-linked');
    tmpDirs.push(tmpDir);
    const fromRoot = await collectLinkBaseline(tmpDir);
    const fromSubdir = await collectLinkBaseline(join(tmpDir, 'apps', 'web'));
    expect(fromSubdir.rootPath).toBe(tmpDir);
    expect(fromSubdir.cwd).toBe(join(tmpDir, 'apps', 'web'));
    const shapeRoot = baselineShape(fromRoot);
    const shapeSubdir = baselineShape(fromSubdir);
    expect({ ...shapeSubdir, cwd: shapeRoot.cwd }).toEqual(shapeRoot);
  });
});
