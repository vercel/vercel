import {
  writeProjectManifest,
  createDiagnostics,
  MANIFEST_VERSION,
  type PackageManifest,
  type PackageManifestDependency,
} from '@vercel/build-utils';

import type { GoModJson } from './go-helpers';

interface NormalizedModule {
  name: string;
  version: string;
  indirect: boolean;
}

/**
 * Applies a `go.mod`'s Replace[] rules to its Require[] list.
 *
 * Version-specific rules (`replace foo v1.2.3 => ...`) only fire when versions match.
 * Version-less rules (`replace foo => ...`) fire for any version of the same module.
 *
 * Local-path replacements (`replace foo => ../local`) drop the module entirely.
 * Module-path replacements (`replace foo => github.com/fork/bar`) substitute name + version.
 *
 * Indirect status is preserved.
 */
export function applyReplaces(goMod: GoModJson): NormalizedModule[] {
  const requires = goMod.Require ?? [];
  const replaces = goMod.Replace ?? [];
  const result: NormalizedModule[] = [];

  for (const req of requires) {
    const specific = replaces.find(
      r => r.Old.Path === req.Path && r.Old.Version === req.Version
    );
    const wildcard = replaces.find(
      r => r.Old.Path === req.Path && r.Old.Version === undefined
    );
    const rule = specific ?? wildcard;

    const indirect = req.Indirect === true;

    if (!rule) {
      result.push({ name: req.Path, version: req.Version, indirect });
      continue;
    }

    if (rule.New.Version === undefined) {
      continue;
    }

    result.push({
      name: rule.New.Path,
      version: rule.New.Version,
      indirect,
    });
  }

  return result;
}

export async function generateProjectManifest({
  workPath,
  goModJson,
  resolvedGoVersion,
  framework,
  serviceType,
}: {
  workPath: string;
  goModJson: GoModJson | null;
  resolvedGoVersion: string;
  framework?: string | null;
  serviceType?: string | null;
}): Promise<void> {
  try {
    if (!goModJson) return;

    const projectModule = goModJson.Module?.Path;
    const modules = applyReplaces(goModJson).filter(
      m => m.name !== projectModule
    );
    const requested = goModJson.Go;

    const directDeps: PackageManifestDependency[] = [];
    const transitiveDeps: PackageManifestDependency[] = [];

    for (const mod of modules) {
      const dep: PackageManifestDependency = {
        name: mod.name,
        type: mod.indirect ? 'transitive' : 'direct',
        scopes: ['prod'],
        requested: mod.version,
        resolved: mod.version,
        source: 'registry',
        sourceUrl: 'https://proxy.golang.org',
      };
      if (mod.indirect) {
        transitiveDeps.push(dep);
      } else {
        directDeps.push(dep);
      }
    }

    const manifest: PackageManifest = {
      version: MANIFEST_VERSION,
      runtime: 'go',
      ...(framework ? { framework } : {}),
      ...(serviceType ? { serviceType } : {}),
      runtimeVersion: {
        ...(requested ? { requested } : {}),
        resolved: resolvedGoVersion,
      },
      dependencies: [
        ...directDeps.sort((a, b) => a.name.localeCompare(b.name)),
        ...transitiveDeps.sort((a, b) => a.name.localeCompare(b.name)),
      ],
    };

    await writeProjectManifest(manifest, workPath, 'go');
  } catch {
    // Never throw — build must succeed
  }
}

export const diagnostics = createDiagnostics('go');
