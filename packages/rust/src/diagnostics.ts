import {
  writeProjectManifest,
  createDiagnostics,
  MANIFEST_VERSION,
  type PackageManifest,
  type PackageManifestDependency,
} from '@vercel/build-utils';
import type { CargoMetadataRoot } from './lib/cargo';

function parseSource(source: string | null): {
  include: boolean;
  source?: string;
  sourceUrl?: string;
} {
  if (!source) return { include: false };
  if (source.startsWith('path+file:')) return { include: false };
  if (
    source.startsWith('registry+https://github.com/rust-lang/crates.io-index')
  ) {
    return {
      include: true,
      source: 'registry',
      sourceUrl: 'https://crates.io',
    };
  }
  if (source.startsWith('registry+')) {
    const url = source.slice('registry+'.length).split(/[?#]/)[0];
    return { include: true, source: 'registry', sourceUrl: url };
  }
  if (source.startsWith('git+')) {
    const url = source.slice('git+'.length).split(/[?#]/)[0];
    return { include: true, source: 'git', sourceUrl: url };
  }
  return { include: true };
}

export async function generateProjectManifest({
  workPath,
  cargoMetadata,
}: {
  workPath: string;
  cargoMetadata: CargoMetadataRoot;
}): Promise<void> {
  try {
    const { packages, resolve } = cargoMetadata;

    const pkgById = new Map(packages.map(p => [p.id, p]));

    const rootId = resolve.root;
    const rootNode = resolve.nodes.find(n => n.id === rootId);
    if (!rootNode) return;

    const rootPkg = pkgById.get(rootId);

    // Direct deps: root node's deps with scopes from dep_kinds
    const directMap = new Map<
      string,
      { scopes: string[]; requested?: string }
    >();
    for (const dep of rootNode.deps) {
      const scopes = dep.dep_kinds.map(dk =>
        dk.kind === 'dev' ? 'dev' : dk.kind === 'build' ? 'build' : 'prod'
      );
      const depPkg = pkgById.get(dep.pkg);
      const req = rootPkg?.dependencies.find(d => d.name === depPkg?.name)?.req;
      directMap.set(dep.pkg, {
        scopes: [...new Set(scopes)].sort(),
        requested: req,
      });
    }

    const directEntries: PackageManifestDependency[] = [];
    const transitiveEntries: PackageManifestDependency[] = [];

    for (const node of resolve.nodes) {
      if (node.id === rootId) continue;

      const pkg = pkgById.get(node.id);
      if (!pkg) continue;

      const sourceInfo = parseSource(pkg.source);
      if (!sourceInfo.include) continue;

      const directInfo = directMap.get(node.id);
      const entry: PackageManifestDependency = {
        name: pkg.name,
        type: directInfo ? 'direct' : 'transitive',
        // Transitive scope would require full graph traversal to trace which
        // root-level scope pulled this in. 'prod' is a safe default — accurate
        // scope propagation for transitives is left to future work.
        scopes: directInfo ? directInfo.scopes : ['prod'],
        resolved: pkg.version,
      };

      if (directInfo?.requested) entry.requested = directInfo.requested;
      if (sourceInfo.source) entry.source = sourceInfo.source;
      if (sourceInfo.sourceUrl) entry.sourceUrl = sourceInfo.sourceUrl;

      if (directInfo) directEntries.push(entry);
      else transitiveEntries.push(entry);
    }

    const manifest: PackageManifest = {
      version: MANIFEST_VERSION,
      runtime: 'rust',
      dependencies: [
        ...directEntries.sort((a, b) => a.name.localeCompare(b.name)),
        ...transitiveEntries.sort((a, b) => a.name.localeCompare(b.name)),
      ],
    };

    await writeProjectManifest(manifest, workPath, 'rust');
  } catch {
    // Never throw — manifest generation is best-effort and must not fail the
    // build. Possible throws: writeProjectManifest fails on disk full or
    // permissions; cargoMetadata is malformed or missing expected fields.
  }
}

export const diagnostics = createDiagnostics('rust');
