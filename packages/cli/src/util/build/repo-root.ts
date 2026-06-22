import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, relative } from 'node:path';
import { getGitRootDirectory } from '../git-helpers';

/**
 * Resolves the root of the repository/monorepo that contains `cwd`.
 *
 * When `vc build` is invoked from a monorepo subdirectory, dependencies are
 * frequently hoisted to the repository root above it (e.g. pnpm's
 * `<root>/node_modules/.pnpm/...`). Builders need to trace files relative to
 * that true root rather than the subdirectory, otherwise:
 *
 *   * Next.js sets `outputFileTracingRoot` / `turbopack.root` to the
 *     subdirectory, so Turbopack errors outright and Webpack `.nft.json`
 *     traces omit hoisted dependencies (runtime `Cannot find module`), and
 *   * `--standalone` emits function file keys that climb out of the function
 *     (`../../node_modules/...`), breaking both zipping and runtime
 *     resolution.
 *
 * Detection walks up from `cwd` and prefers, in order:
 *
 *  1. A workspace marker that defines a monorepo (pnpm-workspace.yaml, a
 *     `package.json` with a `workspaces` field, lerna.json, or rush.json).
 *     This is the most reliable signal and, crucially, does not depend on a
 *     `.git` directory being present — many CI / prebuilt flows build from a
 *     shallow copy or an extracted artifact with no git metadata.
 *  2. The Git repository root (`git rev-parse --show-toplevel`), as a fallback
 *     when no workspace marker is found but the project is in a git checkout.
 *  3. `cwd` itself, when nothing else can be determined.
 *
 * The returned path is always an ancestor of (or equal to) `cwd`.
 */
export function resolveRepoRoot({ cwd }: { cwd: string }): string {
  const workspaceRoot = findWorkspaceRoot(cwd);
  if (workspaceRoot) {
    return workspaceRoot;
  }

  const gitRoot = getGitRootDirectory({ cwd });
  if (gitRoot) {
    return gitRoot;
  }

  return cwd;
}

/**
 * Walks up the directory tree from `startDir` looking for the highest-level
 * workspace marker. Returns the workspace root, or `null` when none is found.
 *
 * We return the *highest* matching ancestor so that nested setups (an app
 * inside a package inside a monorepo) resolve to the outermost workspace,
 * which is where dependencies are ultimately hoisted.
 */
export function findWorkspaceRoot(startDir: string): string | null {
  const { root } = parse(startDir);
  let dir = startDir;
  let highestMatch: string | null = null;

  // Bound the traversal to avoid pathological loops; a monorepo is never
  // hundreds of directories deep.
  for (let i = 0; i < 64; i++) {
    if (isWorkspaceRoot(dir)) {
      highestMatch = dir;
    }
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return highestMatch;
}

/**
 * Returns true when `dir` looks like the root of a workspace/monorepo.
 */
function isWorkspaceRoot(dir: string): boolean {
  if (
    existsSync(join(dir, 'pnpm-workspace.yaml')) ||
    existsSync(join(dir, 'lerna.json')) ||
    existsSync(join(dir, 'rush.json'))
  ) {
    return true;
  }

  // npm / yarn / bun workspaces are declared via `workspaces` in package.json.
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const { workspaces } = pkg;
      if (
        (Array.isArray(workspaces) && workspaces.length > 0) ||
        (workspaces &&
          typeof workspaces === 'object' &&
          Array.isArray(workspaces.packages) &&
          workspaces.packages.length > 0)
      ) {
        return true;
      }
    } catch {
      // Malformed package.json — ignore and keep walking.
    }
  }

  return false;
}

/**
 * Result of resolving a per-directory link (`apps/api/.vercel/project.json`)
 * against the detected repository root.
 */
export interface PerDirectoryLinkRoot {
  /** The detected repository root (an ancestor of, or equal to, `anchorDir`). */
  repoRoot: string;
  /**
   * The project's root directory relative to `repoRoot` (the "resolved root
   * directory"). Empty string when the link is at the repo root.
   */
  resolvedRootDirectory: string;
  /**
   * Set when the link's `rootDirectory` setting disagrees with the link's
   * physical location. The setting is ignored (the location wins); this
   * message explains what happened so the user can clean up their config.
   */
  advisory?: string;
}

/**
 * Resolves a per-directory link to its canonical `(repoRoot,
 * resolvedRootDirectory)` against the detected repository root.
 *
 * A per-directory link (`<dir>/.vercel/project.json`) is anchored by its
 * physical location: the project lives at `anchorDir`, full stop. The repo
 * root is detected independently by walking up from `anchorDir`. The project's
 * root directory relative to that root is therefore always `relative(repoRoot,
 * anchorDir)` — the link's own location expressed against the root.
 *
 * The link's stored `rootDirectory` is treated as advisory only. It commonly
 * (and harmlessly) restates the link's location (e.g. a link at `apps/api`
 * with `rootDirectory: "apps/api"`); such redundancy is absorbed silently.
 * Any other non-empty value disagrees with the physical location and is
 * ignored — the location always wins — with an advisory returned so the caller
 * can surface it. The build is never moved to a location other than where the
 * link physically sits.
 *
 * @param anchorDir absolute path to the directory containing `.vercel`
 * @param rootDirectorySetting the project's `rootDirectory` setting, if any
 */
export function resolvePerDirectoryLinkRoot(
  anchorDir: string,
  rootDirectorySetting: string | null | undefined
): PerDirectoryLinkRoot {
  const repoRoot = resolveRepoRoot({ cwd: anchorDir });
  const resolvedRootDirectory = normalizeRelative(
    relative(repoRoot, anchorDir)
  );

  // The link is at (or above) the detected root, or no distinct root was
  // found: nothing to resolve, the setting keeps its normal meaning.
  if (resolvedRootDirectory === '') {
    return { repoRoot, resolvedRootDirectory: '' };
  }

  const setting = normalizeRelative(rootDirectorySetting ?? '');
  if (setting === '' || setting === resolvedRootDirectory) {
    // Nullish, or a redundant restatement of the link's location — absorb.
    return { repoRoot, resolvedRootDirectory };
  }

  // The setting names somewhere other than the link's location. The physical
  // location wins; surface the disagreement so the user can fix their config.
  return {
    repoRoot,
    resolvedRootDirectory,
    advisory:
      `Ignoring "rootDirectory" setting "${setting}" for the project linked in ` +
      `"${anchorDir}": a project linked in this directory always builds from ` +
      `"${resolvedRootDirectory}" (its path relative to the repository root ` +
      `"${repoRoot}"). Remove the "rootDirectory" setting, or configure it at ` +
      `the repository root instead.`,
  };
}

/** Normalizes a relative path: strips leading `./`, trailing slashes, and `.`. */
function normalizeRelative(p: string): string {
  const normalized = p
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}
