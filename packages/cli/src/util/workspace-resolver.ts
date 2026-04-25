import { join, resolve, basename } from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import minimatch from 'minimatch';
import output from '../output-manager';

// Inlined from projects/link.ts to avoid the heavy transitive dependency chain
// (link.ts -> @vercel/build-utils) which can cause import errors in tests.
const VERCEL_DIR = '.vercel';
const VERCEL_DIR_REPO = 'repo.json';

export interface ResolvedProject {
  /** Absolute path to the project directory */
  projectPath: string;
  /** Resolved project name */
  projectName: string;
  /** How the project was resolved */
  source: 'vercel-link' | 'pnpm' | 'npm' | 'yarn' | 'conventional';
}

/**
 * Cache workspace resolution results per repo root to avoid
 * redundant filesystem traversals within a single CLI execution.
 */
const resolvedCache = new Map<string, Map<string, ResolvedProject>>();

/**
 * Resolves a project name to a directory within a monorepo.
 *
 * Resolution priority:
 *   1. `.vercel/repo.json` – Vercel-linked projects
 *   2. `pnpm-workspace.yaml` – pnpm workspaces
 *   3. `package.json` workspaces – npm / yarn workspaces
 *   4. Conventional directories – `apps/`, `packages/`, or repo root
 *
 * @param repoRoot - Absolute path to the repository root
 * @param projectName - Name of the project to resolve
 * @returns Resolved project metadata
 * @throws Error if the project cannot be found or config is invalid
 */
export async function resolveWorkspaceProject(
  repoRoot: string,
  projectName: string
): Promise<ResolvedProject> {
  // Check cache first
  const cacheKey = repoRoot;
  const projectMap = resolvedCache.get(cacheKey);
  if (projectMap) {
    const cached = projectMap.get(projectName);
    if (cached) {
      output.debug(
        `Workspace resolver cache hit: "${projectName}" -> ${cached.projectPath}`
      );
      return cached;
    }
  }

  // 1. Vercel repo link (.vercel/repo.json)
  const vercelResult = await resolveFromVercelRepoLink(repoRoot, projectName);
  if (vercelResult) {
    cacheResult(cacheKey, projectName, vercelResult);
    return vercelResult;
  }

  // 2. pnpm workspaces (pnpm-workspace.yaml)
  const pnpmResult = await resolveFromPnpmWorkspace(repoRoot, projectName);
  if (pnpmResult) {
    cacheResult(cacheKey, projectName, pnpmResult);
    return pnpmResult;
  }

  // 3. npm / yarn workspaces (package.json "workspaces" field)
  const npmResult = await resolveFromPackageJsonWorkspaces(
    repoRoot,
    projectName
  );
  if (npmResult) {
    cacheResult(cacheKey, projectName, npmResult);
    return npmResult;
  }

  // 4. Conventional directories (apps/, packages/, root match)
  const conventionalResult = await resolveFromConventionalDirs(
    repoRoot,
    projectName
  );
  if (conventionalResult) {
    cacheResult(cacheKey, projectName, conventionalResult);
    return conventionalResult;
  }

  throw new Error(
    `Could not find project "${projectName}" in the repository at ${repoRoot}.\n` +
      `Searched:\n` +
      `  - .vercel/repo.json\n` +
      `  - pnpm-workspace.yaml\n` +
      `  - package.json workspaces\n` +
      `  - Conventional directories (apps/, packages/)\n\n` +
      `Hint: Ensure the project is listed in your workspace config or exists in apps/ or packages/.`
  );
}

function cacheResult(
  cacheKey: string,
  projectName: string,
  result: ResolvedProject
): void {
  let projectMap = resolvedCache.get(cacheKey);
  if (!projectMap) {
    projectMap = new Map();
    resolvedCache.set(cacheKey, projectMap);
  }
  projectMap.set(projectName, result);
}

// ---------------------------------------------------------------------------
// 1. Resolve from .vercel/repo.json
// ---------------------------------------------------------------------------

interface RepoConfig {
  orgId?: string;
  remoteName: string;
  projects: Array<{
    id: string;
    name: string;
    directory: string;
    orgId?: string;
  }>;
}

async function resolveFromVercelRepoLink(
  repoRoot: string,
  projectName: string
): Promise<ResolvedProject | null> {
  const repoJsonPath = join(repoRoot, VERCEL_DIR, VERCEL_DIR_REPO);
  let raw: string;
  try {
    raw = await readFile(repoJsonPath, 'utf8');
  } catch {
    return null;
  }

  let config: RepoConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    output.debug(`Failed to parse ${repoJsonPath}`);
    return null;
  }

  if (!Array.isArray(config.projects)) {
    return null;
  }

  const match = config.projects.find(p => p.name === projectName);
  if (!match) {
    return null;
  }

  const projectPath = resolve(repoRoot, match.directory);
  return {
    projectPath,
    projectName: match.name,
    source: 'vercel-link',
  };
}

// ---------------------------------------------------------------------------
// 2. Resolve from pnpm-workspace.yaml
// ---------------------------------------------------------------------------

/**
 * Minimal parser for pnpm-workspace.yaml.
 * Extracts workspace glob patterns from the `packages:` list without
 * requiring a full YAML parser dependency.
 *
 * Expected format:
 * ```yaml
 * packages:
 *   - 'apps/*'
 *   - 'packages/*'
 * ```
 */
function parsePnpmWorkspaceYaml(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split(/\r?\n/);
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    // A new top-level key ends the packages block
    if (inPackages && /^\S/.test(line) && trimmed !== '') {
      break;
    }

    if (inPackages && trimmed.startsWith('-')) {
      // Strip leading dash, whitespace, and quotes
      const value = trimmed
        .slice(1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (value) {
        patterns.push(value);
      }
    }
  }

  return patterns;
}

async function resolveFromPnpmWorkspace(
  repoRoot: string,
  projectName: string
): Promise<ResolvedProject | null> {
  const wsPath = join(repoRoot, 'pnpm-workspace.yaml');
  let content: string;
  try {
    content = await readFile(wsPath, 'utf8');
  } catch {
    return null;
  }

  const patterns = parsePnpmWorkspaceYaml(content);
  if (patterns.length === 0) {
    output.debug(
      `pnpm-workspace.yaml found but contains no workspace patterns`
    );
    return null;
  }

  return findProjectInWorkspacePatterns(
    repoRoot,
    patterns,
    projectName,
    'pnpm'
  );
}

// ---------------------------------------------------------------------------
// 3. Resolve from package.json workspaces (npm / yarn)
// ---------------------------------------------------------------------------

async function resolveFromPackageJsonWorkspaces(
  repoRoot: string,
  projectName: string
): Promise<ResolvedProject | null> {
  const pkgPath = join(repoRoot, 'package.json');
  let raw: string;
  try {
    raw = await readFile(pkgPath, 'utf8');
  } catch {
    return null;
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch {
    output.debug(`Failed to parse ${pkgPath}`);
    return null;
  }

  let patterns: string[];
  const workspaces = pkg.workspaces;

  if (Array.isArray(workspaces)) {
    // npm / yarn v1 format: "workspaces": ["apps/*", "packages/*"]
    patterns = workspaces.filter((w): w is string => typeof w === 'string');
  } else if (
    workspaces &&
    typeof workspaces === 'object' &&
    'packages' in workspaces &&
    Array.isArray((workspaces as Record<string, unknown>).packages)
  ) {
    // yarn v1 alternative: "workspaces": { "packages": ["apps/*"] }
    patterns = (
      (workspaces as Record<string, unknown>).packages as unknown[]
    ).filter((w): w is string => typeof w === 'string');
  } else {
    return null;
  }

  if (patterns.length === 0) {
    return null;
  }

  // Determine source: check for yarn.lock to differentiate
  let source: 'npm' | 'yarn' = 'npm';
  try {
    await stat(join(repoRoot, 'yarn.lock'));
    source = 'yarn';
  } catch {
    // npm by default
  }

  return findProjectInWorkspacePatterns(
    repoRoot,
    patterns,
    projectName,
    source
  );
}

// ---------------------------------------------------------------------------
// 4. Resolve from conventional directories
// ---------------------------------------------------------------------------

async function resolveFromConventionalDirs(
  repoRoot: string,
  projectName: string
): Promise<ResolvedProject | null> {
  const conventionalDirs = ['apps', 'packages'];

  for (const dir of conventionalDirs) {
    const candidatePath = join(repoRoot, dir, projectName);
    if (await isDirectory(candidatePath)) {
      return {
        projectPath: candidatePath,
        projectName,
        source: 'conventional',
      };
    }
  }

  // Also check if the project name matches a directory name at repo root
  const candidatePath = join(repoRoot, projectName);
  if (
    (await isDirectory(candidatePath)) &&
    projectName !== '.vercel' &&
    projectName !== 'node_modules'
  ) {
    return {
      projectPath: candidatePath,
      projectName,
      source: 'conventional',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Expands workspace glob patterns and finds a project by matching its
 * `package.json` name or directory basename against `projectName`.
 */
async function findProjectInWorkspacePatterns(
  repoRoot: string,
  patterns: string[],
  projectName: string,
  source: 'pnpm' | 'npm' | 'yarn'
): Promise<ResolvedProject | null> {
  const matches: ResolvedProject[] = [];

  for (const pattern of patterns) {
    // Skip negation patterns
    if (pattern.startsWith('!')) {
      continue;
    }

    // Expand the glob by listing parent directories
    const dirs = await expandWorkspacePattern(repoRoot, pattern);
    for (const dir of dirs) {
      const match = await matchProjectDir(repoRoot, dir, projectName, source);
      if (match) {
        matches.push(match);
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  // Prefer name match over basename match
  const nameMatch = matches.find(m => m.projectName === projectName);
  if (nameMatch) {
    return nameMatch;
  }

  throw new Error(
    `Ambiguous project "${projectName}" — found ${matches.length} matching workspace packages:\n` +
      matches.map(m => `  - ${m.projectPath}`).join('\n') +
      `\n\nPlease use a more specific project name.`
  );
}

/**
 * Expands a single workspace glob pattern into directory paths.
 * Handles patterns like "apps/*", "packages/**", or "utils".
 */
async function expandWorkspacePattern(
  repoRoot: string,
  pattern: string
): Promise<string[]> {
  // If pattern has no glob chars, it's a direct directory
  if (!pattern.includes('*') && !pattern.includes('?')) {
    const dirPath = join(repoRoot, pattern);
    if (await isDirectory(dirPath)) {
      return [dirPath];
    }
    return [];
  }

  // Split pattern into parent dir and glob suffix
  // e.g., "apps/*" -> parentDir="apps", glob="*"
  const parts = pattern.split('/');
  const parentParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*') || parts[i].includes('?')) {
      break;
    }
    parentParts.push(parts[i]);
  }

  const parentDir = join(repoRoot, ...parentParts);
  if (!(await isDirectory(parentDir))) {
    return [];
  }

  // Read children of parent directory and filter with minimatch
  try {
    const entries = await readdir(parentDir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const entryPath = join(parentDir, entry.name);
      const relativePath = [...parentParts, entry.name].join('/');

      if (minimatch(relativePath, pattern)) {
        results.push(entryPath);
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Checks if a workspace directory matches the requested project name
 * by comparing against its `package.json` name field or directory basename.
 */
async function matchProjectDir(
  _repoRoot: string,
  dirPath: string,
  projectName: string,
  source: 'pnpm' | 'npm' | 'yarn'
): Promise<ResolvedProject | null> {
  // Try matching via package.json name
  const pkgPath = join(dirPath, 'package.json');
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    if (typeof pkg.name === 'string') {
      // Match on exact name or unscoped name (e.g., "@scope/my-app" matches "my-app")
      const pkgName: string = pkg.name;
      const unscopedName = pkgName.startsWith('@')
        ? pkgName.split('/')[1]
        : pkgName;

      if (pkgName === projectName || unscopedName === projectName) {
        return {
          projectPath: dirPath,
          projectName: pkgName,
          source,
        };
      }
    }
  } catch {
    // no package.json or parse error – fall through to basename match
  }

  // Fall back to directory basename match
  if (basename(dirPath) === projectName) {
    return {
      projectPath: dirPath,
      projectName,
      source,
    };
  }

  return null;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Clears the internal workspace resolution cache.
 * Exposed for testing purposes.
 */
export function clearWorkspaceResolverCache(): void {
  resolvedCache.clear();
}
