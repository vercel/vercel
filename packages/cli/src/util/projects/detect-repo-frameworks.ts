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
 * How deep to walk the tree. Shared with the root-directory picker so every
 * directory it can list is also deep enough to have been given a label.
 */
export const MAX_SCAN_DEPTH = 4;

/** Upper bound on directories visited during a scan. */
const MAX_DIRECTORIES = 400;

/** Repo-relative directory -> frameworks detected there. Root is `''`. */
export type RepoFrameworks = Map<string, Framework[]>;

/** A detection run started ahead of the prompt that consumes it. */
export interface PendingRepoFrameworks {
  promise: Promise<RepoFrameworks>;
  /**
   * The result, or `undefined` while detection is still running. Set
   * synchronously rather than via a consumer-side `.then()`, whose callback
   * would not fire until after the prompt's first render.
   */
  result: () => RepoFrameworks | undefined;
}

/**
 * Start repo-wide framework detection without awaiting it. Never rejects:
 * labels are decorative, so failure resolves to an empty map.
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

/** Detect frameworks across the repo. */
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

  // Both sources are used: a workspace can cover only part of the tree, so
  // relying on it alone leaves everything outside it unlabeled.
  // `getWorkspacePackagePaths` returns '/apps/web'; normalize to repo-relative.
  const candidates = await walkDirectories(cwd);
  for (const p of packagePaths) {
    candidates.add(normalizePath(p).replace(/^\/+/, ''));
  }

  // Neither source reports the root itself.
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

  for (let depth = 0; depth < MAX_SCAN_DEPTH; depth++) {
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

/** The label to show beside a directory, e.g. `Next.js`. Primary match only. */
export function frameworkLabel(
  frameworks: RepoFrameworks,
  relativeDir: string
): string | undefined {
  const detected = frameworks.get(relativeDir);
  return detected?.[0]?.name;
}
