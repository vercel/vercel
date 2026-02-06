/*
 * Convert Pipfile and Pipfile.lock to pyproject.toml
 */

/** The default PyPI index name used by Pipenv */
const PYPI_INDEX_NAME = 'pypi';

import { isPlainObject } from '../util/type';
import { formatPep508, mergeExtras, splitExtras } from './pep508';
import type {
  PipfileDependency,
  PipfileDependencyDetail,
  PipfileLike,
  PipfileLockLike,
  PipfileSource,
} from './pipfile/types';
import type { PyProjectToml } from './pyproject/types';
import type {
  DependencySource,
  NormalizedRequirement,
} from './requirement/types';

interface ToolUvIndexEntry {
  name: string;
  url: string;
  explicit?: boolean;
}

/**
 * Add a dependency source to the sources map.
 */
function addDepSource(
  sources: Record<string, DependencySource[]>,
  dep: NormalizedRequirement
): void {
  if (!dep.source) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(sources, dep.name)) {
    sources[dep.name].push(dep.source);
  } else {
    sources[dep.name] = [dep.source];
  }
}

/**
 * Check if a source is the default PyPI source.
 */
function isPypiSource(source: PipfileSource): boolean {
  return typeof source?.name === 'string' && source.name === PYPI_INDEX_NAME;
}

/**
 * Process Pipfile sources and return index entries for tool.uv.index.
 */
function processIndexSources(sources: PipfileSource[]): ToolUvIndexEntry[] {
  const hasPypi = sources.some(isPypiSource);
  const setExplicit = sources.length > 1 && hasPypi;
  const indexes: ToolUvIndexEntry[] = [];

  for (const source of sources) {
    if (isPypiSource(source)) {
      continue;
    }

    const entry: ToolUvIndexEntry = {
      name: source.name,
      url: source.url,
    };

    if (setExplicit) {
      entry.explicit = true;
    }

    indexes.push(entry);
  }

  return indexes;
}

/**
 * Build tool.uv section from sources and indexes.
 */
function buildUvToolSection(
  sources: Record<string, DependencySource[]>,
  indexes: ToolUvIndexEntry[]
): Record<string, unknown> | null {
  const uv: Record<string, unknown> = {};

  if (indexes.length > 0) {
    uv.index = indexes;
  }

  if (Object.keys(sources).length > 0) {
    uv.sources = sources;
  }

  return Object.keys(uv).length > 0 ? uv : null;
}

/**
 * Convert Pipfile dependencies to normalized requirements.
 */
function pipfileDepsToRequirements(
  entries: Record<string, PipfileDependency>
): NormalizedRequirement[] {
  const deps: NormalizedRequirement[] = [];

  for (const [name, properties] of Object.entries(entries)) {
    const dep = pipfileDepToRequirement(name, properties);
    deps.push(dep);
  }

  return deps;
}

/**
 * Convert a single Pipfile dependency to a normalized requirement.
 */
function pipfileDepToRequirement(
  spec: string,
  properties: PipfileDependency
): NormalizedRequirement {
  const [name, extrasFromName] = splitExtras(spec);
  const dep: NormalizedRequirement = { name };

  if (extrasFromName && extrasFromName.length > 0) {
    dep.extras = extrasFromName;
  }

  if (typeof properties === 'string') {
    dep.version = properties;
  } else if (properties && typeof properties === 'object') {
    // Copy version
    if (properties.version) {
      dep.version = properties.version;
    }

    // Merge extras from properties
    if (properties.extras) {
      dep.extras = mergeExtras(dep.extras, properties.extras);
    }

    // Copy markers
    if (properties.markers) {
      dep.markers = properties.markers;
    }

    // Build source
    const source = buildDependencySource(properties);
    if (source) {
      dep.source = source;
    }
  }

  return dep;
}

/**
 * Convert Pipfile.lock dependencies to normalized requirements.
 */
function pipfileLockDepsToRequirements(
  entries: Record<string, PipfileDependencyDetail>
): NormalizedRequirement[] {
  const deps: NormalizedRequirement[] = [];

  for (const [name, properties] of Object.entries(entries)) {
    const dep = pipfileLockDepToRequirement(name, properties);
    deps.push(dep);
  }

  return deps;
}

/**
 * Convert a single Pipfile.lock dependency to a normalized requirement.
 */
function pipfileLockDepToRequirement(
  spec: string,
  properties: PipfileDependencyDetail
): NormalizedRequirement {
  const [name, extrasFromName] = splitExtras(spec);
  const dep: NormalizedRequirement = { name };

  if (extrasFromName && extrasFromName.length > 0) {
    dep.extras = extrasFromName;
  }

  // Copy relevant properties from the lock package
  if (properties.version) {
    dep.version = properties.version;
  }

  // Merge extras from name and from properties
  if (properties.extras) {
    dep.extras = mergeExtras(dep.extras, properties.extras);
  }

  if (properties.markers) {
    dep.markers = properties.markers;
  }

  // Build source
  const source = buildDependencySource(properties);
  if (source) {
    dep.source = source;
  }

  return dep;
}

/**
 * Build a DependencySource from Pipfile dependency properties.
 */
function buildDependencySource(
  properties: PipfileDependencyDetail
): DependencySource | null {
  const source: DependencySource = {};

  // Index source (skip if it's the default pypi)
  if (properties.index && properties.index !== PYPI_INDEX_NAME) {
    source.index = properties.index;
  }

  // Git source
  if (properties.git) {
    source.git = properties.git;

    if (properties.ref) {
      source.rev = properties.ref;
    }
  }

  // Path source
  if (properties.path) {
    source.path = properties.path;
    if (properties.editable) {
      source.editable = true;
    }
  }

  // Only return source if it has any properties
  return Object.keys(source).length > 0 ? source : null;
}

/**
 * Migrate a parsed Pipfile to a pyproject.toml object suitable for uv.
 *
 * This creates a minimal pyproject:
 *
 * [project]
 * dependencies = [...]
 *
 * [dependency-groups]
 * dev = [...]
 *
 * [tool.uv.sources] + [[tool.uv.index]]
 */
export function convertPipfileToPyprojectToml(
  pipfile: PipfileLike
): PyProjectToml {
  const sources: Record<string, DependencySource[]> = {};
  const pyproject: PyProjectToml = {};

  // Process main packages
  const deps: string[] = [];
  for (const dep of pipfileDepsToRequirements(pipfile.packages || {})) {
    deps.push(formatPep508(dep));
    addDepSource(sources, dep);
  }
  if (deps.length > 0) {
    pyproject.project = {
      dependencies: deps,
    };
  }

  // Process dev packages
  const devDeps: string[] = [];
  for (const dep of pipfileDepsToRequirements(pipfile['dev-packages'] || {})) {
    devDeps.push(formatPep508(dep));
    addDepSource(sources, dep);
  }
  if (devDeps.length > 0) {
    pyproject['dependency-groups'] = {
      dev: devDeps,
    };
  }

  // Process custom sections (categories)
  const RESERVED_KEYS = new Set([
    'packages',
    'dev-packages',
    'source',
    'scripts',
    'requires',
    'pipenv',
  ]);

  for (const [sectionName, value] of Object.entries(pipfile)) {
    if (RESERVED_KEYS.has(sectionName)) continue;
    if (!isPlainObject(value)) continue;

    const groupDeps: string[] = [];
    for (const dep of pipfileDepsToRequirements(
      value as Record<string, PipfileDependency>
    )) {
      groupDeps.push(formatPep508(dep));
      addDepSource(sources, dep);
    }
    if (groupDeps.length > 0) {
      pyproject['dependency-groups'] = {
        ...(pyproject['dependency-groups'] || {}),
        [sectionName]: groupDeps,
      };
    }
  }

  // Process index sources
  const indexes = processIndexSources(pipfile.source ?? []);

  // Build tool.uv section
  const uv = buildUvToolSection(sources, indexes);
  if (uv) {
    pyproject.tool = { uv };
  }

  return pyproject;
}

/**
 * Migrate a parsed Pipfile.lock to a pyproject.toml object suitable for uv.
 *
 * Pipfile.lock uses different key names than Pipfile:
 * - "default" instead of "packages"
 * - "develop" instead of "dev-packages"
 * - Custom categories use the same name in both files
 *
 * This creates a minimal pyproject:
 *
 * [project]
 * dependencies = [...]
 *
 * [dependency-groups]
 * dev = [...]
 *
 * [tool.uv.sources] + [[tool.uv.index]]
 */
export function convertPipfileLockToPyprojectToml(
  pipfileLock: PipfileLockLike
): PyProjectToml {
  const sources: Record<string, DependencySource[]> = {};
  const pyproject: PyProjectToml = {};

  // Process default (main) packages
  const deps: string[] = [];
  for (const dep of pipfileLockDepsToRequirements(pipfileLock.default || {})) {
    deps.push(formatPep508(dep));
    addDepSource(sources, dep);
  }
  if (deps.length > 0) {
    pyproject.project = {
      dependencies: deps,
    };
  }

  // Process develop (dev) packages
  const devDeps: string[] = [];
  for (const dep of pipfileLockDepsToRequirements(pipfileLock.develop || {})) {
    devDeps.push(formatPep508(dep));
    addDepSource(sources, dep);
  }
  if (devDeps.length > 0) {
    pyproject['dependency-groups'] = {
      dev: devDeps,
    };
  }

  // Process custom categories
  const RESERVED_KEYS = new Set(['_meta', 'default', 'develop']);

  for (const [sectionName, value] of Object.entries(pipfileLock)) {
    if (RESERVED_KEYS.has(sectionName)) continue;
    if (!isPlainObject(value)) continue;

    const groupDeps: string[] = [];
    for (const dep of pipfileLockDepsToRequirements(
      value as Record<string, PipfileDependencyDetail>
    )) {
      groupDeps.push(formatPep508(dep));
      addDepSource(sources, dep);
    }
    if (groupDeps.length > 0) {
      pyproject['dependency-groups'] = {
        ...(pyproject['dependency-groups'] || {}),
        [sectionName]: groupDeps,
      };
    }
  }

  // Process sources from _meta
  const indexes = processIndexSources(pipfileLock._meta?.sources ?? []);

  // Build tool.uv section
  const uv = buildUvToolSection(sources, indexes);
  if (uv) {
    pyproject.tool = { uv };
  }

  return pyproject;
}
