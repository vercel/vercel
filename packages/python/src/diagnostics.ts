import fs from 'fs';
import {
  writeProjectManifest,
  createDiagnostics,
  MANIFEST_VERSION,
  type PackageManifest,
  type PackageManifestDependency,
} from '@vercel/build-utils';
import {
  parseUvLock,
  normalizePackageName,
  parsePep508,
  type DependencyGroupEntry,
  type PyProjectDependencyGroups,
  type PythonPackage,
  type UvLockPackageSource,
} from '@vercel/python-analysis';
import type { PythonVersion } from './version';
import { pythonVersionString } from './version';

function isDependencyGroupInclude(
  entry: DependencyGroupEntry
): entry is { 'include-group': string } {
  return typeof entry === 'object' && 'include-group' in entry;
}

/**
 * Resolve a dependency group, recursively following `{include-group: "..."}` references.
 * Cycle detection via `ancestors` prevents infinite recursion.
 */
function resolveDependencyGroup(
  groupName: string,
  allGroups: PyProjectDependencyGroups,
  ancestors: Set<string> = new Set()
): string[] {
  if (ancestors.has(groupName)) return [];
  const entries = allGroups[groupName];
  if (!Array.isArray(entries)) return [];

  ancestors.add(groupName);
  const result: string[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      result.push(entry);
    } else if (isDependencyGroupInclude(entry)) {
      result.push(
        ...resolveDependencyGroup(entry['include-group'], allGroups, ancestors)
      );
    }
  }
  ancestors.delete(groupName);
  return result;
}

function mapSource(src: UvLockPackageSource | undefined): {
  source?: string;
  sourceUrl?: string;
} {
  if (!src) return {};
  if (src.virtual) return {};
  if (src.registry) {
    try {
      const url = new URL(src.registry);
      return { source: 'registry', sourceUrl: url.origin };
    } catch {
      return { source: 'registry', sourceUrl: src.registry };
    }
  }
  if (src.git) return { source: 'git', sourceUrl: src.git };
  if (src.url) return { source: 'url', sourceUrl: src.url };
  if (src.editable) return { source: 'editable', sourceUrl: src.editable };
  if (src.path) return { source: 'path', sourceUrl: src.path };
  return {};
}

/**
 * Generate and write the project manifest to `.vercel/python/package-manifest.json`.
 * Called during build() so data is collected while it's already available.
 */
export async function generateProjectManifest({
  workPath,
  pythonPackage,
  pythonVersion,
  uvLockPath,
  framework,
}: {
  workPath: string;
  pythonPackage: PythonPackage;
  pythonVersion: PythonVersion;
  uvLockPath: string;
  framework?: string | null;
}): Promise<void> {
  const resolved = pythonVersionString(pythonVersion) ?? '';
  const constraint = pythonPackage.requiresPython?.[0];
  const requested = constraint?.specifier;

  const project = pythonPackage.manifest?.data?.project;
  const pyprojectData = pythonPackage.manifest?.data;

  // Track direct dependency names and their scopes.
  // A package can appear in multiple groups, so we collect all scopes.
  const directScopesMap = new Map<string, Set<string>>();
  const directRequested = new Map<string, string>();

  // Collect all raw dependency strings paired with their scope first,
  // then parse them in a single batch to avoid repeated WASM calls.
  const allRawDeps: { dep: string; scope: string }[] = [];

  // 1. project.dependencies → scope "main"
  if (project?.dependencies && Array.isArray(project.dependencies)) {
    for (const dep of project.dependencies) {
      allRawDeps.push({ dep, scope: 'main' });
    }
  }

  // 2. project.optional-dependencies → scope = group key
  const optDeps = project?.['optional-dependencies'];
  if (optDeps) {
    for (const [group, deps] of Object.entries(optDeps)) {
      if (Array.isArray(deps)) {
        for (const dep of deps) {
          allRawDeps.push({ dep, scope: group });
        }
      }
    }
  }

  // 3. dependency-groups → scope = group key
  // Supports PEP 735 include-group references via recursive resolution.
  const depGroups = pyprojectData?.['dependency-groups'];
  if (depGroups) {
    for (const group of Object.keys(depGroups)) {
      const groupDeps = resolveDependencyGroup(group, depGroups);
      for (const dep of groupDeps) {
        allRawDeps.push({ dep, scope: group });
      }
    }
  }

  // 4. tool.uv.dev-dependencies → scope "dev" (legacy, pre-PEP 735)
  const uvDevDeps = pyprojectData?.tool?.uv?.['dev-dependencies'];
  if (uvDevDeps && Array.isArray(uvDevDeps)) {
    for (const dep of uvDevDeps) {
      allRawDeps.push({ dep, scope: 'dev' });
    }
  }

  // Parse all dependency strings in a single batch.
  const allParsed = await parsePep508(allRawDeps.map(d => d.dep));
  for (let i = 0; i < allRawDeps.length; i++) {
    const parsed = allParsed[i];
    if (!parsed) continue;
    const { dep, scope } = allRawDeps[i];
    const normalized = normalizePackageName(parsed.name);
    let scopes = directScopesMap.get(normalized);
    if (!scopes) {
      scopes = new Set();
      directScopesMap.set(normalized, scopes);
    }
    scopes.add(scope);
    // Keep the first requested string we see for this package
    if (!directRequested.has(normalized)) {
      directRequested.set(normalized, dep);
    }
  }

  // Resolve versions and source info from the lock file
  const directEntries: PackageManifestDependency[] = [];
  const transitiveEntries: PackageManifestDependency[] = [];

  {
    const content = await fs.promises.readFile(uvLockPath, 'utf-8');
    const uvLock = parseUvLock(content, uvLockPath);
    const projectName = project?.name;
    const excludeSet = new Set(
      projectName ? [normalizePackageName(projectName)] : []
    );

    // Build maps from the lock file
    const lockMap = new Map<
      string,
      { version: string; source?: UvLockPackageSource }
    >();
    // Forward dependency graph: package → set of packages it depends on
    const depGraph = new Map<string, Set<string>>();

    for (const pkg of uvLock.packages) {
      const normalized = normalizePackageName(pkg.name);
      if (excludeSet.has(normalized)) continue;
      if (pkg.source?.virtual) continue;
      lockMap.set(normalized, { version: pkg.version, source: pkg.source });
      if (pkg.dependencies) {
        const deps = new Set<string>();
        for (const d of pkg.dependencies) {
          deps.add(normalizePackageName(d.name));
        }
        depGraph.set(normalized, deps);
      }
    }

    // Propagate scopes from direct deps through the dependency graph.
    // BFS from each direct dep: every reachable transitive package
    // inherits the scopes of the direct dep.
    const transitiveScopesMap = new Map<string, Set<string>>();

    for (const [name, scopes] of directScopesMap) {
      const queue = [name];
      let head = 0;
      const visited = new Set<string>();
      while (head < queue.length) {
        const current = queue[head++];
        if (visited.has(current)) continue;
        visited.add(current);
        const children = depGraph.get(current);
        if (!children) continue;
        for (const child of children) {
          if (excludeSet.has(child)) continue;
          if (!directScopesMap.has(child)) {
            let childScopes = transitiveScopesMap.get(child);
            if (!childScopes) {
              childScopes = new Set();
              transitiveScopesMap.set(child, childScopes);
            }
            for (const s of scopes) {
              childScopes.add(s);
            }
          }
          if (!visited.has(child)) {
            queue.push(child);
          }
        }
      }
    }

    // Build direct entries
    for (const [name, scopes] of directScopesMap) {
      const info = lockMap.get(name);
      const entry: PackageManifestDependency = {
        name,
        type: 'direct',
        scopes: [...scopes].sort(),
        requested: directRequested.get(name),
        resolved: info?.version ?? '',
      };
      if (info) {
        const src = mapSource(info.source);
        if (src.source) entry.source = src.source;
        if (src.sourceUrl) entry.sourceUrl = src.sourceUrl;
      }
      directEntries.push(entry);
    }

    // Build transitive entries (only include packages reachable from a direct dep)
    for (const [normalized, info] of lockMap) {
      if (directScopesMap.has(normalized)) continue;
      const scopes = transitiveScopesMap.get(normalized);
      if (!scopes || scopes.size === 0) continue;
      const src = mapSource(info.source);
      transitiveEntries.push({
        name: normalized,
        type: 'transitive',
        scopes: [...scopes].sort(),
        resolved: info.version,
        ...(src.source ? { source: src.source } : {}),
        ...(src.sourceUrl ? { sourceUrl: src.sourceUrl } : {}),
      });
    }
  }

  const manifest: PackageManifest = {
    version: MANIFEST_VERSION,
    runtime: 'python',
    ...(framework ? { framework } : {}),
    runtimeVersion: {
      ...(requested ? { requested } : {}),
      ...(constraint?.source ? { requestedSource: constraint.source } : {}),
      resolved,
    },
    dependencies: [
      ...directEntries.sort((a, b) => a.name.localeCompare(b.name)),
      ...transitiveEntries.sort((a, b) => a.name.localeCompare(b.name)),
    ],
  };

  await writeProjectManifest(manifest, workPath, 'python');
}

export const diagnostics = createDiagnostics('python');
