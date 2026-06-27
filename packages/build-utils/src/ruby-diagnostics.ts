import fs from 'fs';
import {
  writeProjectManifest,
  MANIFEST_VERSION,
  type PackageManifest,
  type PackageManifestDependency,
} from './package-manifest';

const GEM_SPEC_PATTERN = /^(\S+) \(([^)]+)\)$/;
const DEPENDENCY_PATTERN = /^([^\s!]+)(!?)(?:\s+\(([^)]+)\))?$/;

enum GemSource {
  REGISTRY = 'registry',
  GIT = 'git',
  PLUGIN = 'plugin',
}

interface GemEntry {
  version: string;
  source: GemSource;
  sourceUrl: string;
}

export function parseGemfileLock(content: string): {
  gems: Map<string, GemEntry>;
  directGems: Map<string, string | undefined>;
} {
  const gems = new Map<string, GemEntry>();
  const pathGems = new Set<string>();
  const directGems = new Map<string, string | undefined>();

  enum Section {
    GEM = 'gem',
    GIT = 'git',
    PATH = 'path',
    PLUGIN = 'plugin',
    DEPENDENCIES = 'dependencies',
  }

  enum SubSection {
    SPECS = 'specs',
  }

  let section: Section | null = null;
  let subSection: SubSection | null = null;
  let currentRemote = '';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();

    if (!line) continue;

    if (!line.startsWith(' ')) {
      currentRemote = '';
      if (line === 'GEM') section = Section.GEM;
      else if (line === 'GIT') section = Section.GIT;
      else if (line === 'PATH') section = Section.PATH;
      else if (line === 'PLUGIN SOURCE') section = Section.PLUGIN;
      else if (line === 'DEPENDENCIES') section = Section.DEPENDENCIES;
      else section = null;
      subSection = null;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const text = line.trimStart();

    if (
      section === Section.GEM ||
      section === Section.GIT ||
      section === Section.PLUGIN
    ) {
      if (indent === 2) {
        if (text.startsWith('remote:')) {
          currentRemote = text.slice('remote:'.length).trim();
          subSection = null;
        } else if (text === 'specs:') {
          subSection = SubSection.SPECS;
        }
      } else if (indent === 4 && subSection === SubSection.SPECS) {
        const m = text.match(GEM_SPEC_PATTERN);
        if (!m) continue;

        const [, name, version] = m;
        let gem: GemEntry;
        if (section === Section.GIT) {
          gem = { version, source: GemSource.GIT, sourceUrl: currentRemote };
        } else if (section === Section.PLUGIN) {
          gem = { version, source: GemSource.PLUGIN, sourceUrl: currentRemote };
        } else {
          let sourceUrl = currentRemote;
          try {
            sourceUrl = new URL(currentRemote).origin;
          } catch {}
          gem = { version, source: GemSource.REGISTRY, sourceUrl };
        }

        // Prefer registry gems over git/plugin; prefer base version over platform
        // variants (e.g. nokogiri (1.18.0) over nokogiri (1.18.0-arm64-darwin)).
        if (gems.has(name)) {
          const existing = gems.get(name)!;
          const isPlatformVariant = /-[a-zA-Z]/.test(version);
          const existingIsPlatformVariant = /-[a-zA-Z]/.test(existing.version);
          if (isPlatformVariant) continue;
          if (existing.source === gem.source && !existingIsPlatformVariant)
            continue;
          if (gem.source !== GemSource.REGISTRY) continue;
        }

        gems.set(name, gem);
      }
    }

    if (section === Section.PATH) {
      if (indent === 2 && text === 'specs:') {
        subSection = SubSection.SPECS;
      } else if (indent === 4 && subSection === SubSection.SPECS) {
        const m = text.match(GEM_SPEC_PATTERN);
        if (!m) continue;

        const [, name] = m;
        pathGems.add(name);
      }
    }

    if (section === Section.DEPENDENCIES) {
      if (indent === 2) {
        const m = text.match(DEPENDENCY_PATTERN);
        if (!m) continue;

        const [, name, , version] = m;
        directGems.set(name, version);
      }
    }
  }

  // Exclude PATH gems (local, not deployable) regardless of ! marker
  for (const name of pathGems) {
    directGems.delete(name);
  }

  return { gems, directGems };
}

export async function generateRubyProjectManifest({
  workPath,
  gemfileLockPath,
  framework,
  serviceType,
}: {
  workPath: string;
  gemfileLockPath: string | undefined;
  framework?: string | null;
  serviceType?: string | null;
}): Promise<void> {
  try {
    if (!gemfileLockPath) return;

    let content: string;
    try {
      content = await fs.promises.readFile(gemfileLockPath, 'utf-8');
    } catch {
      return;
    }

    const { gems, directGems } = parseGemfileLock(content);

    const directEntries: PackageManifestDependency[] = [];
    const transitiveEntries: PackageManifestDependency[] = [];

    for (const [name, version] of directGems) {
      const gem = gems.get(name);
      const entry: PackageManifestDependency = {
        name,
        type: 'direct',
        scopes: ['prod'],
        ...(version ? { requested: version } : {}),
        resolved: gem?.version ?? '',
      };
      if (gem?.source) entry.source = gem.source;
      if (gem?.sourceUrl) entry.sourceUrl = gem.sourceUrl;
      directEntries.push(entry);
    }

    for (const [name, gem] of gems) {
      if (directGems.has(name)) continue;
      const entry: PackageManifestDependency = {
        name,
        type: 'transitive',
        scopes: ['prod'],
        resolved: gem.version,
      };
      if (gem.source) entry.source = gem.source;
      if (gem.sourceUrl) entry.sourceUrl = gem.sourceUrl;
      transitiveEntries.push(entry);
    }

    const manifest: PackageManifest = {
      version: MANIFEST_VERSION,
      runtime: 'ruby',
      ...(framework ? { framework } : {}),
      ...(serviceType ? { serviceType } : {}),
      dependencies: [
        ...directEntries.sort((a, b) => a.name.localeCompare(b.name)),
        ...transitiveEntries.sort((a, b) => a.name.localeCompare(b.name)),
      ],
    };

    await writeProjectManifest(manifest, workPath, 'ruby');
  } catch {
    // never throw — build must succeed
  }
}
