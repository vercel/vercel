import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, relative } from 'node:path';
import yaml from 'js-yaml';
import minimatch from 'minimatch';

/**
 * Workspace manager types whose member declarations we can read and match.
 * A marker we can't interpret (e.g. a bare `lerna.json`) is intentionally not
 * a candidate: membership can't be verified, so the build must not re-anchor
 * onto it.
 */
export type WorkspaceRootCandidate = {
  dir: string;
  type: 'pnpm' | 'npm';
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
 * workspace/monorepo whose member declarations can be read, or `null`.
 */
function workspaceTypeOf(dir: string): WorkspaceRootCandidate['type'] | null {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    return 'pnpm';
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
 * Reads the workspace member patterns declared by the manager manifest at
 * `candidate.dir`. Returns `null` when the manifest can't be read or parsed
 * (treated as "claims nothing" by the caller).
 */
function readWorkspacePatterns(
  candidate: WorkspaceRootCandidate
): string[] | null {
  try {
    if (candidate.type === 'pnpm') {
      const doc = yaml.load(
        readFileSync(join(candidate.dir, 'pnpm-workspace.yaml'), 'utf8')
      ) as { packages?: unknown } | null | undefined;
      const packages = doc?.packages;
      return Array.isArray(packages)
        ? packages.filter((p): p is string => typeof p === 'string')
        : null;
    }

    const pkg = JSON.parse(
      readFileSync(join(candidate.dir, 'package.json'), 'utf8')
    );
    const { workspaces } = pkg;
    const packages = Array.isArray(workspaces)
      ? workspaces
      : workspaces?.packages;
    return Array.isArray(packages)
      ? packages.filter((p: unknown): p is string => typeof p === 'string')
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether the workspace rooted at `candidate.dir` claims `memberDir` as one
 * of its member packages.
 *
 * Membership is decided by matching the member's root-relative path against
 * the manifest's own declared patterns (pure string matching — no filesystem
 * traversal, so a huge `node_modules` or a hostile `**` pattern costs
 * nothing), then confirming the directory is a real package (it has a
 * `package.json`, mirroring how package managers expand workspace globs).
 *
 * Negated patterns (`!apps/legacy`) exclude: a path matching any negation is
 * not a member even when a positive pattern matches, following pnpm/yarn
 * semantics.
 *
 * Membership must be exact: a directory merely *nested inside* a member
 * package (e.g. a fixture or example under `packages/cli/...` when the
 * workspace declares `packages/*`) is NOT claimed — such a directory is not a
 * workspace package and its dependencies are not hoisted for it, so
 * re-anchoring would only distort its build. (`apps/*` does not match
 * `apps/api/test/fixture` because `*` never crosses `/`.)
 */
function workspaceClaims(
  candidate: WorkspaceRootCandidate,
  memberDir: string
): boolean {
  const rel = normalizeRelative(relative(candidate.dir, memberDir));
  if (rel === '') {
    // A workspace root trivially contains itself, but there is nothing to
    // re-anchor in that case.
    return false;
  }

  const patterns = readWorkspacePatterns(candidate);
  if (!patterns || patterns.length === 0) {
    return false;
  }

  const positives: string[] = [];
  const negatives: string[] = [];
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      negatives.push(normalizeRelative(pattern.slice(1)));
    } else {
      positives.push(normalizeRelative(pattern));
    }
  }

  const matches = (pattern: string) => minimatch(rel, pattern, { dot: false });
  if (!positives.some(matches) || negatives.some(matches)) {
    return false;
  }

  // The pattern names this directory; confirm it is a real package, the same
  // way package managers expand workspace globs against `<dir>/package.json`.
  return existsSync(join(memberDir, 'package.json'));
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
export function resolvePerDirectoryLinkRoot(
  anchorDir: string,
  rootDirectorySetting: string | null | undefined
): PerDirectoryLinkRoot {
  let repoRoot = anchorDir;
  for (const candidate of findWorkspaceRootCandidates(anchorDir)) {
    if (workspaceClaims(candidate, anchorDir)) {
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
