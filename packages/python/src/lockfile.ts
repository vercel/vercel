import * as toml from '@iarna/toml';
import { promises as fsp } from 'fs';
import { join } from 'path';

import { debug } from '@vercel/build-utils';
import { parseMajorMinor, compareMajorMinor } from './utils';

interface GenerateOpts {
  entryDirectory: string;
  vendorBaseDir: string;
  fsFiles: Record<string, any>;
  pythonVersion?: string;
}

function fileFromFsFiles(
  fsFiles: Record<string, any>,
  entryDirectory: string,
  filename: string
): string | null {
  const entryPath = join(entryDirectory, filename);
  if (fsFiles[entryPath]) return fsFiles[entryPath].fsPath;
  if (fsFiles[filename]) return fsFiles[filename].fsPath;
  return null;
}

async function writeRequirements(outPath: string, lines: string[]) {
  const unique = Array.from(new Set(lines.filter(Boolean)));
  const contents = unique.join('\n') + (unique.length ? '\n' : '');
  await fsp.writeFile(outPath, contents, 'utf8');
}

function markerMatchesPython(marker: string, pyVersion: string): boolean {
  const py = parseMajorMinor(pyVersion);
  if (!py) return true;

  const hasOr = /\bor\b/i.test(marker);
  const parts = marker.split(/\s+(?:and|or)\s+/i);
  const evalPart = (part: string) => {
    const m = part.match(
      /python(?:_full)?_version\s*([><=!]=|[><=])\s*['"]?(\d+(?:\.\d+)*)['"]?/i
    );
    if (!m) return true; // Unrecognized -> don't filter out
    const op = m[1];
    const val = m[2];
    const cmp = compareMajorMinor(pyVersion, val);
    switch (op) {
      case '>':
        return cmp > 0;
      case '>=':
        return cmp >= 0;
      case '<':
        return cmp < 0;
      case '<=':
        return cmp <= 0;
      case '==':
        return cmp === 0;
      case '!=':
        return cmp !== 0;
      default:
        return true;
    }
  };
  const results = parts.map(evalPart);
  return hasOr ? results.some(Boolean) : results.every(Boolean);
}

async function generateFromUvLock(
  uvLockPath: string,
  pythonVersion?: string
): Promise<string[]> {
  debug(`Parsing UV lockfile at ${uvLockPath}`);
  const raw = await fsp.readFile(uvLockPath, 'utf8');
  const data: any = toml.parse(raw as unknown as string);
  const packages: any[] = Array.isArray(data.package) ? data.package : [];

  type Candidate = { spec: string; version?: string; matches: boolean };
  const selected = new Map<string, Candidate>();

  for (const pkg of packages) {
    if (!pkg || !pkg.name || !pkg.source) continue;
    const source: any = pkg.source || {};
    if (
      source &&
      typeof source === 'object' &&
      'workspace' in source &&
      source.workspace
    )
      continue;

    const name: string = pkg.name;
    const version: string | undefined = pkg.version;
    const category: string | undefined = pkg.category;
    const optional = Boolean(pkg.optional);
    if (optional) continue;
    if (category && category !== 'main' && category !== 'default') continue;

    // Build requirement spec: include only registry, git, or url sources
    let spec: string | undefined;
    const isRegistry =
      source &&
      typeof source === 'object' &&
      typeof source.registry === 'string';
    if (source && typeof source === 'object' && source.type) {
      const stype = String(source.type);
      if (stype === 'git' && source.url) {
        const ref = source.resolved_reference || source.reference;
        let url = `git+${String(source.url)}`;
        if (ref) url += `@${String(ref)}`;
        if (source.subdirectory)
          url += `#subdirectory=${String(source.subdirectory)}`;
        spec = `${name} @ ${url}`;
      } else if (stype === 'url' && source.url) {
        spec = `${name} @ ${String(source.url)}`;
      } else if (stype === 'directory' || stype === 'file') {
        // Skip local path sources
        continue;
      }
    } else if (isRegistry && version) {
      spec = `${name}==${version}`;
    } else if (
      source &&
      typeof source === 'object' &&
      typeof source.editable === 'string'
    ) {
      // Skip editable sources
      continue;
    }
    if (!spec) continue;

    // Determine applicability using resolution_markers only (python-version-specific)
    const resolutionMarkers: string[] = Array.isArray(pkg.resolution_markers)
      ? pkg.resolution_markers
          .filter((m: any) => typeof m === 'string')
          .map((m: string) => m.trim())
      : [];
    let applies = true;
    if (pythonVersion && resolutionMarkers.length > 0) {
      applies = resolutionMarkers.some(m =>
        markerMatchesPython(m, pythonVersion)
      );
    }

    // Preserve original (non-resolution) marker text in requirement line
    if (typeof pkg.marker === 'string' && pkg.marker.trim()) {
      spec += ` ; ${pkg.marker.trim()}`;
    }

    const cand: Candidate = { spec, version, matches: applies };
    const prev = selected.get(name);
    if (!prev) {
      selected.set(name, cand);
      continue;
    }

    // Prefer candidates that match markers; tie-breaker on version
    if (cand.matches && !prev.matches) {
      selected.set(name, cand);
      continue;
    }
    if (!cand.matches && prev.matches) {
      continue;
    }
    if (cand.version && prev.version) {
      if (compareMajorMinor(cand.version, prev.version) > 0) {
        selected.set(name, cand);
      }
      continue;
    }
    selected.set(name, cand);
  }

  const lines = Array.from(selected.values()).map(v => v.spec);
  lines.sort((a, b) => a.localeCompare(b));
  return lines;
}

async function generateFromPoetryLock(
  poetryLockPath: string,
  pythonVersion?: string
): Promise<string[]> {
  debug(`Parsing Poetry lockfile at ${poetryLockPath}`);
  const raw = await fsp.readFile(poetryLockPath, 'utf8');
  const data: any = toml.parse(raw as unknown as string);

  const packages: any[] = Array.isArray((data as any).package)
    ? (data as any).package
    : [];

  const lines: string[] = [];

  for (const pkg of packages) {
    const name: string = pkg.name;
    const version: string | undefined = pkg.version;
    const category: string | undefined = pkg.category;
    const optional = Boolean(pkg.optional);
    const marker: string | undefined = pkg.marker;
    const source: any = pkg.source || {};

    // Only include main/default, non-optional packages by default
    if (optional) continue;
    if (category && category !== 'main' && category !== 'default') continue;

    let spec: string | undefined;
    if (source && typeof source === 'object' && source.type) {
      const stype = String(source.type);
      if (stype === 'git' && source.url) {
        const ref = source.resolved_reference || source.reference;
        let url = `git+${String(source.url)}`;
        if (ref) url += `@${String(ref)}`;
        if (source.subdirectory)
          url += `#subdirectory=${String(source.subdirectory)}`;
        spec = `${name} @ ${url}`;
      } else if (stype === 'url' && source.url) {
        spec = `${name} @ ${String(source.url)}`;
      } else if (stype === 'directory' || stype === 'file') {
        // Skip local paths
        continue;
      }
    } else if (version) {
      spec = `${name}==${version}`;
    }
    if (!spec) continue;

    if (marker && typeof marker === 'string' && marker.trim()) {
      if (pythonVersion && !markerMatchesPython(marker, pythonVersion)) {
        continue;
      }
      spec += ` ; ${marker.trim()}`;
    }

    lines.push(spec);
  }

  // TODO: add support for private registries. we'd need to emit pip index/extra-index lines
  // derived from project source configs (e.g., [tool.poetry.source]).

  lines.sort((a, b) => a.localeCompare(b));
  return lines;
}

async function generateFromPdmLock(
  pdmLockPath: string,
  pythonVersion?: string
): Promise<string[]> {
  debug(`Parsing PDM lockfile at ${pdmLockPath}`);
  const raw = await fsp.readFile(pdmLockPath, 'utf8');
  const data: any = toml.parse(raw as unknown as string);

  const packages: any[] = Array.isArray((data as any).package)
    ? (data as any).package
    : [];

  const lines: string[] = [];

  for (const pkg of packages) {
    const name: string = pkg.name;
    const version: string | undefined = pkg.version;
    const category: string | undefined = pkg.category;
    const optional = Boolean(pkg.optional);
    const marker: string | undefined = pkg.marker;

    if (optional) continue;
    if (category && category !== 'main' && category !== 'default') continue;

    // PDM sources may be in multiple shapes; include only vcs/url/registry
    const source: any = pkg.source || {};
    let spec: string | undefined;
    if (source && typeof source === 'object') {
      if (source.vcs && source.url) {
        const ref =
          source.revision || source.ref || source.tag || source.commit;
        let url = `${String(source.vcs)}+${String(source.url)}`;
        if (ref) url += `@${String(ref)}`;
        if (source.subdirectory)
          url += `#subdirectory=${String(source.subdirectory)}`;
        spec = `${name} @ ${url}`;
      } else if (source.url) {
        spec = `${name} @ ${String(source.url)}`;
      } else if (source.path) {
        // Skip local path
      }
    }

    if (!spec) {
      if (!version) continue;
      spec = `${name}==${version}`;
    }

    if (marker && typeof marker === 'string' && marker.trim()) {
      if (pythonVersion && !markerMatchesPython(marker, pythonVersion)) {
        continue;
      }
      spec += ` ; ${marker.trim()}`;
    }

    lines.push(spec);
  }

  lines.sort((a, b) => a.localeCompare(b));
  return lines;
}

async function generateFromPipenvLock(
  pipfileLockPath: string,
  pythonVersion?: string
): Promise<string[]> {
  debug(`Parsing Pipfile.lock at ${pipfileLockPath}`);
  const raw = await fsp.readFile(pipfileLockPath, 'utf8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Unable to parse Pipfile.lock');
  }

  const sections = ['default']; // Only production by default
  const lines: string[] = [];
  for (const section of sections) {
    const deps = data[section] || {};
    for (const [name, specObj] of Object.entries<any>(deps)) {
      if (!specObj) continue;

      if (specObj.git) {
        const vcs = 'git';
        const url = String(specObj.git);
        const ref = specObj.ref || specObj.commit || specObj.tag;
        const subdir = specObj.subdirectory;
        let refUrl = `${vcs}+${url}`;
        if (ref) refUrl += `@${String(ref)}`;
        if (subdir) refUrl += `#subdirectory=${String(subdir)}`;
        lines.push(`${name} @ ${refUrl}`);
        continue;
      }
      if (specObj.url) {
        lines.push(`${name} @ ${String(specObj.url)}`);
        continue;
      }
      // Skip editable/path entries
      if (specObj.editable || specObj.path) continue;

      let base = name;
      if (Array.isArray(specObj.extras) && specObj.extras.length) {
        base = `${name}[${specObj.extras.join(',')}]`;
      }
      const version =
        typeof specObj.version === 'string' ? specObj.version : undefined;
      if (!version) continue;
      let line = `${base}${version}`; // version already includes the operator, e.g. ==1.2.3
      if (typeof specObj.markers === 'string' && specObj.markers.trim()) {
        const m = specObj.markers.trim();
        if (pythonVersion && !markerMatchesPython(m, pythonVersion)) continue;
        line += ` ; ${m}`;
      }
      lines.push(line);
    }
  }
  lines.sort((a, b) => a.localeCompare(b));
  return lines;
}

async function generateFromPyproject(
  pyprojectPath: string,
  pythonVersion?: string
): Promise<string[]> {
  debug(`Parsing pyproject at ${pyprojectPath}`);
  const raw = await fsp.readFile(pyprojectPath, 'utf8');
  const data: any = toml.parse(raw as unknown as string);
  const project: any = (data as any).project || {};
  const deps: any[] = Array.isArray(project.dependencies)
    ? project.dependencies
    : [];
  if (!deps.length) {
    debug('No project.dependencies found in pyproject.toml');
  }
  const lines: string[] = [];
  for (const d of deps) {
    const s = String(d);
    // If dependency has markers, filter python markers
    const m = s.split(';');
    if (m.length === 2) {
      const [base, marker] = [m[0].trim(), m[1].trim()];
      if (pythonVersion && !markerMatchesPython(marker, pythonVersion))
        continue;
      lines.push(`${base} ; ${marker}`);
    } else {
      lines.push(s);
    }
  }
  lines.sort((a, b) => a.localeCompare(b));
  return lines;
}

export async function maybeGenerateRequirements({
  entryDirectory,
  vendorBaseDir,
  fsFiles,
  pythonVersion,
}: GenerateOpts): Promise<string | null> {
  try {
    const outPath = join(vendorBaseDir, 'requirements.generated.txt');

    const uvLock = fileFromFsFiles(fsFiles, entryDirectory, 'uv.lock');
    const poetryLock = fileFromFsFiles(fsFiles, entryDirectory, 'poetry.lock');
    const pipfileLock = fileFromFsFiles(
      fsFiles,
      entryDirectory,
      'Pipfile.lock'
    );
    const pdmLock = fileFromFsFiles(fsFiles, entryDirectory, 'pdm.lock');
    const pyproject = fileFromFsFiles(
      fsFiles,
      entryDirectory,
      'pyproject.toml'
    );

    let lines: string[] | null = null;

    if (uvLock) {
      lines = await generateFromUvLock(uvLock, pythonVersion);
    } else if (pipfileLock) {
      lines = await generateFromPipenvLock(pipfileLock, pythonVersion);
    } else if (poetryLock) {
      lines = await generateFromPoetryLock(poetryLock, pythonVersion);
    } else if (pdmLock) {
      lines = await generateFromPdmLock(pdmLock, pythonVersion);
    } else if (pyproject) {
      lines = await generateFromPyproject(pyproject, pythonVersion);
    }

    if (lines && lines.length) {
      await writeRequirements(outPath, lines);
      return outPath;
    }

    return null;
  } catch (err) {
    debug(`Failed to generate requirements from lockfiles: ${String(err)}`);
    return null;
  }
}

export async function detectPythonConstraint(
  fsFiles: Record<string, any>,
  entryDirectory: string
): Promise<{ constraint: string; source: string } | undefined> {
  try {
    const pipfileLock = fileFromFsFiles(
      fsFiles,
      entryDirectory,
      'Pipfile.lock'
    );
    if (pipfileLock) {
      const raw = await fsp.readFile(pipfileLock, 'utf8');
      const data: any = JSON.parse(raw);
      const v = data?._meta?.requires?.python_version;
      if (typeof v === 'string' && v.trim())
        return { constraint: v.trim(), source: 'Pipfile.lock' };
    }

    const poetryLock = fileFromFsFiles(fsFiles, entryDirectory, 'poetry.lock');
    const pdmLock = fileFromFsFiles(fsFiles, entryDirectory, 'pdm.lock');
    const uvLock = fileFromFsFiles(fsFiles, entryDirectory, 'uv.lock');
    const pyproject = fileFromFsFiles(
      fsFiles,
      entryDirectory,
      'pyproject.toml'
    );
    if (poetryLock) {
      const raw = await fsp.readFile(poetryLock, 'utf8');
      const data: any = toml.parse(raw as unknown as string);
      const metadata = (data as any).metadata || {};
      const versions = metadata['python-versions'];
      if (typeof versions === 'string' && versions.trim())
        return { constraint: versions.trim(), source: 'poetry.lock' };
    }
    if (pdmLock) {
      const raw = await fsp.readFile(pdmLock, 'utf8');
      const data: any = toml.parse(raw as unknown as string);
      const metadata = (data as any).metadata || {};
      const requires =
        metadata['requires-python'] ||
        metadata['python_requires'] ||
        metadata['python'];
      if (typeof requires === 'string' && requires.trim())
        return { constraint: requires.trim(), source: 'pdm.lock' };
    }
    if (uvLock) {
      const raw = await fsp.readFile(uvLock, 'utf8');
      const data: any = toml.parse(raw as unknown as string);
      const metadata = (data as any).metadata || {};
      const requires =
        metadata['requires-python'] ||
        metadata['python'] ||
        metadata['python-versions'];
      if (typeof requires === 'string' && requires.trim())
        return { constraint: requires.trim(), source: 'uv.lock' };
    }
    if (pyproject) {
      const raw = await fsp.readFile(pyproject, 'utf8');
      const data: any = toml.parse(raw as unknown as string);
      const project: any = (data as any).project || {};
      const requires = project['requires-python'];
      if (typeof requires === 'string' && requires.trim())
        return { constraint: requires.trim(), source: 'pyproject.toml' };
      const toolPoetry = (data as any).tool?.poetry?.dependencies;
      const poetryPy = toolPoetry?.python;
      if (typeof poetryPy === 'string' && poetryPy.trim())
        return { constraint: poetryPy.trim(), source: 'pyproject.toml' };
    }
  } catch (err) {
    debug(`Failed to detect python constraint: ${String(err)}`);
  }
  return undefined;
}
