import fs from 'fs';
import {
  writeProjectManifest,
  createDiagnostics,
  MANIFEST_VERSION,
  type PackageManifest,
  type PackageManifestDependency,
} from '@vercel/build-utils';

interface GoModModule {
  name: string;
  version: string;
  indirect: boolean;
}

const stripComment = (s: string) => s.replace(/\/\/.*$/, '').trim();

// `// indirect` may appear with or without a leading space. Match Go's
// modfile parser by allowing either form, but only as the trailing comment.
const isIndirectComment = (s: string) => /\/\/\s*indirect\s*$/.test(s);

// Parses a require entry — text after the `require` keyword (single-line)
// or a single line inside a `require ( ... )` block.
function parseRequireEntry(
  text: string,
  rawWithComment: string
): GoModModule | null {
  const m = stripComment(text).match(/^(\S+)\s+(\S+)/);
  if (!m) return null;
  return {
    name: m[1],
    version: m[2],
    indirect: isIndirectComment(rawWithComment),
  };
}

// Parses a replace entry — text after the `replace` keyword (single-line)
// or a single line inside a `replace ( ... )` block. Returns the LHS module
// name iff the entry replaces it with a local file path (RHS has no version,
// per the Go spec); returns null for module-path replacements and for
// unparseable lines.
function getDependencyReplacedByLocal(text: string): string | null {
  const m = stripComment(text).match(
    /^(\S+)(?:\s+\S+)?\s+=>\s+\S+(?:\s+(\S+))?\s*$/
  );
  if (!m) return null;
  return m[2] ? null : m[1];
}

export function parseGoMod(content: string): {
  goVersion: string;
  modules: GoModModule[];
} {
  const lines = content.split(/\r?\n/);
  let goVersion = '';
  const allModules: GoModModule[] = [];
  const localReplaces = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].trim();

    if (!raw || raw.startsWith('//')) {
      i++;
      continue;
    }

    // Read the go version
    const goMatch = raw.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/);
    if (goMatch) {
      goVersion = goMatch[1];
      i++;
      continue;
    }

    // Read a require block
    if (/^require\s*\(/.test(raw)) {
      i++;
      while (i < lines.length) {
        const innerRaw = lines[i].trim();
        if (innerRaw === ')') {
          i++;
          break;
        }
        const entry = parseRequireEntry(innerRaw, innerRaw);
        if (entry) allModules.push(entry);
        i++;
      }
      continue;
    }

    // Read a replace block
    if (/^replace\s*\(/.test(raw)) {
      i++;
      while (i < lines.length) {
        const innerRaw = lines[i].trim();
        if (innerRaw === ')') {
          i++;
          break;
        }
        const local = getDependencyReplacedByLocal(innerRaw);
        if (local) localReplaces.add(local);
        i++;
      }
      continue;
    }

    // Read a single-line require
    const reqHead = stripComment(raw).match(/^require\s+(.*)$/);
    if (reqHead) {
      const entry = parseRequireEntry(reqHead[1], raw);
      if (entry) allModules.push(entry);
      i++;
      continue;
    }

    // Read a single-line replace
    const replHead = stripComment(raw).match(/^replace\s+(.*)$/);
    if (replHead) {
      const local = getDependencyReplacedByLocal(replHead[1]);
      if (local) localReplaces.add(local);
      i++;
      continue;
    }

    i++;
  }

  const modules = allModules.filter(m => !localReplaces.has(m.name));
  return { goVersion, modules };
}

export async function generateProjectManifest({
  workPath,
  goModPath,
  goVersion,
}: {
  workPath: string;
  goModPath: string | undefined;
  goVersion: string;
}): Promise<void> {
  try {
    if (!goModPath) return;

    const content = await fs.promises.readFile(goModPath, 'utf-8');
    const { goVersion: parsedGoVersion, modules } = parseGoMod(content);

    const resolved = parsedGoVersion || goVersion;

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
      runtimeVersion: {
        resolved,
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
