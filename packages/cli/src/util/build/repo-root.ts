import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, relative } from 'node:path';
import {
  getWorkspacePackagePaths,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';

/**
 * Workspace manager types whose member lists we can resolve (via
 * `@vercel/fs-detectors`). A marker we can't enumerate members for (e.g. a
 * bare `lerna.json`) is intentionally not a candidate: membership can't be
 * verified, so the build must not re-anchor onto it.
 */
export type WorkspaceRootCandidate = {
  dir: string;
  type: 'pnpm' | 'npm' | 'rush';
};

/**
 * Walks up from `startDir` and returns every ancestor (including `startDir`
 * itself) that carries a workspace marker, ordered outermost first — so the
 * first candidate that *claims* a directory is the root where dependencies
 * are hoisted.
 */
export function findWorkspaceRootCandidates(
  startDir: string
): WorkspaceRootCandidate[] {
  const { root } = parse(startDir);
  const candidates: WorkspaceRootCandidate[] = [];
  let dir = startDir;

  // Bound the traversal to avoid pathological loops.
  for (let i = 0; i < 64; i++) {
    const type = workspaceTypeOf(dir);
    if (type) {
      candidates.unshift({ dir, type });
    }
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return candidates;
}

/**
 * Returns the workspace manager type when `dir` looks like the root of a
 * workspace/monorepo whose members can be enumerated, or `null`.
 */
function workspaceTypeOf(dir: string): WorkspaceRootCandidate['type'] | null {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(dir, 'rush.json'))) {
    return 'rush';
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
        return 'npm';
      }
    } catch {
      // Malformed package.json — ignore and keep walking.
    }
  }

  return null;
}

/**
 * Whether the workspace rooted at `candidate.dir` claims `memberDir` as one
 * of its member packages.
 *
 * Membership must be exact: a directory merely *nested inside* a member
 * package (e.g. a fixture or example under `packages/cli/...` when the
 * workspace declares `packages/*`) is NOT claimed — such a directory is not a
 * workspace package and its dependencies are not hoisted for it, so
 * re-anchoring would only distort its build.
 *
 * Membership is resolved through `@vercel/fs-detectors`, which parses the
 * manager's own manifest (`pnpm-workspace.yaml`, `package.json#workspaces`,
 * `rush.json`) and expands its globs against the filesystem. Any failure to
 * read or parse is treated as "not a member" — the safe default is to leave
 * the build un-anchored rather than re-anchor onto a root that never
 * declared this project.
 */
async function workspaceClaims(
  candidate: WorkspaceRootCandidate,
  memberDir: string
): Promise<boolean> {
  const rel = normalizeRelative(relative(candidate.dir, memberDir));
  if (rel === '') {
    // A workspace root trivially contains itself, but there is nothing to
    // re-anchor in that case.
    return false;
  }

  try {
    const fs = new LocalFileSystemDetector(candidate.dir);
    const packagePaths = await getWorkspacePackagePaths({
      fs,
      workspace: { type: candidate.type, rootPath: '/' },
    });
    return packagePaths.some(
      packagePath => normalizeRelative(packagePath) === rel
    );
  } catch {
    return false;
  }
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
 * Resolves a per-directory link (`<dir>/.vercel/project.json`) against the
 * workspace root that claims it, returning the project's root directory
 * relative to that root.
 *
 * The build is only re-anchored when an ancestor workspace actually declares
 * the linked directory as a member package (e.g. `apps/api` matching an
 * `apps/*` workspace glob). A project that merely *sits inside* an unrelated
 * repository — a fixture, a vendored folder, a scratch project in a company
 * monorepo — is left untouched and builds from its own directory, exactly as
 * an unlinked-root build would.
 *
 * The `rootDirectory` setting is interpreted relative to the link's own
 * location (`anchorDir`): if `anchorDir/<setting>` exists, it is honored;
 * otherwise the setting is treated as redundant/misconfigured (e.g. a link at
 * `apps/api` whose setting `apps/api` would resolve to a non-existent
 * `apps/api/apps/api`) and ignored in favor of the link's own location, with
 * an advisory surfaced via `advisory`.
 */
export async function resolvePerDirectoryLinkRoot(
  anchorDir: string,
  rootDirectorySetting: string | null | undefined
): Promise<PerDirectoryLinkRoot> {
  let repoRoot = anchorDir;
  for (const candidate of findWorkspaceRootCandidates(anchorDir)) {
    if (await workspaceClaims(candidate, anchorDir)) {
      repoRoot = candidate.dir;
      break;
    }
  }
  const linkLocation = normalizeRelative(relative(repoRoot, anchorDir));

  // No workspace claims this directory (or the link is at the root itself):
  // nothing to resolve.
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

/** Normalizes a relative path: strips leading `/`, `./`, trailing slashes, and `.`. */
function normalizeRelative(p: string): string {
  const normalized = p
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}
