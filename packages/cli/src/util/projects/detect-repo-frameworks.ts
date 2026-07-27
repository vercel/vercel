import { join } from 'path';
import { frameworkList, type Framework } from '@vercel/frameworks';
import {
  detectFrameworks,
  getWorkspacePackagePaths,
  getWorkspaces,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';
import { normalizePath } from '@vercel/build-utils';
import { isIgnoredDirectory } from './ignored-directories';
import output from '../../output-manager';

/**
 * How deep to walk when the repo is not a workspace.
 *
 * Workspaces tell us exactly where their packages are, so they need no walk.
 * Everything else gets a bounded scan: 3 levels covers the common layouts
 * (`app/`, `apps/web/`, `services/api/src` style roots) without turning the
 * scan into a full-tree crawl on a large repo.
 */
const NON_WORKSPACE_MAX_DEPTH = 3;

/** Upper bound on directories visited during a non-workspace scan. */
const MAX_DIRECTORIES = 400;

/**
 * Repo-relative directory -> the frameworks detected there.
 *
 * The repo root is the empty string, matching `detectProjects()` and the
 * root-directory prompt's `ROOT_VALUE`.
 */
export type RepoFrameworks = Map<string, Framework[]>;

/**
 * A detection run that was started ahead of time.
 *
 * Detection is kicked off as soon as we know a project will be created, so the
 * filesystem work overlaps with the prompts the user is answering in the
 * meantime. Consumers `await` the promise only at the point they actually need
 * labels, and never block on it: `settled()` reports whether the result is
 * already available so callers can render immediately and skip labels rather
 * than stall a prompt behind a slow scan.
 */
export interface PendingRepoFrameworks {
  promise: Promise<RepoFrameworks>;
  /**
   * The result, or `undefined` while detection is still running.
   *
   * Resolved synchronously by the owner of the run rather than by a `.then()`
   * on the consumer side: a late subscriber's callback only fires on the next
   * microtask, which is easily after the first render, so labels would be
   * dropped even though the data was ready.
   */
  result: () => RepoFrameworks | undefined;
}

/**
 * Start repo-wide framework detection without awaiting it.
 *
 * Never rejects: detection is decorative, so any failure resolves to an empty
 * map and the caller silently renders unlabeled directories.
 */
export function startRepoFrameworkDetection(
  cwd: string
): PendingRepoFrameworks {
  let result: RepoFrameworks | undefined;

  const promise = detectRepoFrameworks(cwd)
    .catch(err => {
      output.debug(`Repo framework detection failed: ${err}`);
      return new Map<string, Framework[]>();
    })
    .then(detected => {
      result = detected;
      return detected;
    });

  return { promise, result: () => result };
}

/**
 * Detect frameworks across the repo.
 *
 * Workspace repos use the package list the workspace manager reports. Anything
 * else falls back to a bounded breadth-first walk, since a non-workspace
 * monorepo still routinely has a deployable app in a subdirectory.
 */
export async function detectRepoFrameworks(
  cwd: string
): Promise<RepoFrameworks> {
  const fs = new LocalFileSystemDetector(cwd);
  const workspaces = await getWorkspaces({ fs });

  const packagePaths = (
    await Promise.all(
      workspaces.map(workspace => getWorkspacePackagePaths({ fs, workspace }))
    )
  ).flat();

  // Both sources are used, not one or the other. A repo can declare a
  // workspace that covers only part of the tree (a nested `redwoodjs/`
  // workspace inside a directory of unrelated apps), and relying on the
  // workspace alone would leave everything outside it unlabeled.
  //
  // `getWorkspacePackagePaths` returns leading-slash paths ('/apps/web'); the
  // walk returns repo-relative ones. Normalize to repo-relative, root = ''.
  const candidates = await walkDirectories(cwd);
  for (const p of packagePaths) {
    candidates.add(normalizePath(p).replace(/^\/+/, ''));
  }

  // Always consider the root itself, which neither source reports.
  candidates.add('');

  const detected: RepoFrameworks = new Map();

  await Promise.all(
    Array.from(candidates).map(async relative => {
      try {
        const frameworks = await detectFrameworks({
          fs: relative ? fs.chdir(join('.', relative)) : fs,
          frameworkList,
        });
        if (frameworks.length > 0) {
          detected.set(relative, frameworks);
        }
      } catch (err) {
        output.debug(`Framework detection failed for "${relative}": ${err}`);
      }
    })
  );

  return detected;
}

/** Bounded breadth-first collection of candidate directories. */
async function walkDirectories(cwd: string): Promise<Set<string>> {
  const { readdir } = await import('fs/promises');
  const found = new Set<string>();
  let level = [''];
  let visited = 0;

  for (let depth = 0; depth < NON_WORKSPACE_MAX_DEPTH; depth++) {
    if (level.length === 0 || visited >= MAX_DIRECTORIES) break;

    const next: string[] = [];

    for (const dir of level) {
      if (visited >= MAX_DIRECTORIES) break;
      visited++;

      let entries;
      try {
        entries = await readdir(join(cwd, dir), { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || isIgnoredDirectory(entry.name)) continue;
        const relative = dir ? `${dir}/${entry.name}` : entry.name;
        found.add(relative);
        next.push(relative);
      }
    }

    level = next;
  }

  return found;
}

/**
 * The label to show beside a directory, e.g. `(Next.js)`.
 *
 * Only the primary (highest-priority) detected framework is shown; listing
 * every match makes the list noisy in exactly the monorepos that need it most.
 */
export function frameworkLabel(
  frameworks: RepoFrameworks,
  relativeDir: string
): string | undefined {
  const detected = frameworks.get(relativeDir);
  return detected?.[0]?.name;
}
