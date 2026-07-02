import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, relative } from 'node:path';
import { getGitRootDirectory } from '../git-helpers';

/**
 * Resolves the repository root containing `cwd`, preferring a workspace marker
 * (which doesn't need `.git`, unlike CI/prebuilt flows), then the git root,
 * then `cwd`. The result is always an ancestor of (or equal to) `cwd`.
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
 * Walks up from `startDir` and returns the *highest* ancestor with a workspace
 * marker (so nested workspaces resolve to the outermost root, where deps are
 * hoisted), or `null` if none.
 */
export function findWorkspaceRoot(startDir: string): string | null {
  const { root } = parse(startDir);
  let dir = startDir;
  let highestMatch: string | null = null;

  // Bound the traversal to avoid pathological loops.
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

export interface PerDirectoryLinkRoot {
  /** Detected repository root (ancestor of, or equal to, `anchorDir`). */
  repoRoot: string;
  /** Project root directory relative to `repoRoot`; empty when at the root. */
  resolvedRootDirectory: string;
  /** Set when `rootDirectory` disagreed with the link's location and was ignored. */
  advisory?: string;
}

/**
 * Resolves a per-directory link (`<dir>/.vercel/project.json`) against the repo
 * root, returning the project's root directory relative to it.
 *
 * The `rootDirectory` setting is interpreted relative to the link's own
 * location (`anchorDir`): if `anchorDir/<setting>` exists, it is honored;
 * otherwise the setting is treated as redundant/misconfigured (e.g. a link at
 * `apps/api` whose setting `apps/api` would resolve to a non-existent
 * `apps/api/apps/api`) and ignored in favor of the link's own location, with
 * an advisory surfaced via `advisory`.
 */
export function resolvePerDirectoryLinkRoot(
  anchorDir: string,
  rootDirectorySetting: string | null | undefined
): PerDirectoryLinkRoot {
  const repoRoot = resolveRepoRoot({ cwd: anchorDir });
  const linkLocation = normalizeRelative(relative(repoRoot, anchorDir));

  // Link at (or above) the root: nothing to resolve.
  if (linkLocation === '') {
    return { repoRoot, resolvedRootDirectory: '' };
  }

  // No setting: build from the link's own location.
  const setting = normalizeRelative(rootDirectorySetting ?? '');
  if (setting === '') {
    return { repoRoot, resolvedRootDirectory: linkLocation };
  }

  // Honor the setting only if it points at a real folder relative to the link.
  if (existsSync(join(anchorDir, setting))) {
    return {
      repoRoot,
      resolvedRootDirectory: normalizeRelative(
        relative(repoRoot, join(anchorDir, setting))
      ),
    };
  }

  // The setting points nowhere (redundant restatement or misconfig); fall back
  // to the link's own location and warn.
  return {
    repoRoot,
    resolvedRootDirectory: linkLocation,
    advisory:
      `Ignoring "rootDirectory" setting "${setting}" for the project linked in ` +
      `"${anchorDir}": "${join(anchorDir, setting)}" does not exist, so the ` +
      `build will use the linked directory "${linkLocation}" instead. Remove ` +
      `the "rootDirectory" setting, or configure it at the repository root.`,
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
