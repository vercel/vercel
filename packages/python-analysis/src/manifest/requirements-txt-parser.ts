/*
 * Convert requirements.txt and requirements.in to pyproject.toml
 *
 * Uses the WASM-based uv-requirements-txt parser for PEP 508 parsing,
 * pip option extraction, git URL processing, and -r/-c recursion.
 * File I/O for referenced files is handled via AsyncLocalStorage host-bridge.
 */

/** Name for the primary index when --index-url is specified */
const PRIMARY_INDEX_NAME = 'primary';
/** Prefix for extra index names when --extra-index-url is specified */
const EXTRA_INDEX_PREFIX = 'extra-';
/** Prefix for flat index names when --find-links is specified */
const FIND_LINKS_PREFIX = 'find-links-';

import { isAbsolute, join, relative } from 'node:path/posix';

import type { PyProjectToml } from './pyproject/types';
import type {
  DependencySource,
  NormalizedRequirement,
} from './requirement/types';
import type { UvIndexEntry } from './uv-config/types';
import type {
  ParsedReqEntry,
  ParsedRequirementsTxt,
} from '#wasm/vercel_python_analysis.js';
import { formatPep508 } from './pep508';
import { importWasmModule } from '../wasm/load';
import { readFileStorage } from '../wasm/host-utils';
import type { ReadFileFn } from '../wasm/host-utils';

/**
 * Parsed pip arguments from requirements file.
 */
export interface PipOptions {
  /** Primary index URL (--index-url or -i) - only the last one is kept */
  indexUrl?: string;
  /** Extra index URLs (--extra-index-url) */
  extraIndexUrls: string[];
  /** Directories/URLs for --find-links / -f (only set when present) */
  findLinks?: string[];
  /** Whether --no-index was specified (only set when true) */
  noIndex?: boolean;
}

/**
 * Result of parsing a requirements file with pip options.
 */
export interface ParsedRequirementsFile {
  requirements: NormalizedRequirement[];
  pipOptions: PipOptions;
}

/**
 * Options for parsing requirements files.
 */
export interface ParseRequirementsOptions {
  /** Function to read referenced requirement files (-r, -c). */
  readFile?: ReadFileFn;
  /** Directory containing the requirements file, used for resolving relative paths. */
  workingDir?: string;
  /**
   * Package root directory (where pyproject.toml lives).
   * When set and different from workingDir, source paths are rebased
   * relative to this directory in convertRequirementsToPyprojectToml.
   */
  packageRoot?: string;
}

/**
 * Parse requirements.txt content using the WASM parser.
 * When readFile is provided, wraps the call in AsyncLocalStorage context
 * so the WASM host-bridge can delegate file reads for -r/-c recursion.
 */
async function parseWithWasm(
  content: string,
  readFile?: ReadFileFn,
  workingDir?: string
): Promise<ParsedRequirementsTxt> {
  const wasm = await importWasmModule();
  // Rust defaults workingDir to "/" when None; keep TS context in sync
  const resolvedDir = workingDir ?? '/';
  if (readFile) {
    return readFileStorage.run({ readFile, workingDir: resolvedDir }, () =>
      wasm.parseRequirementsTxt(content, resolvedDir, undefined)
    );
  }
  return wasm.parseRequirementsTxt(content, workingDir ?? undefined, undefined);
}

/**
 * Convert a WASM-parsed requirement entry to a NormalizedRequirement.
 */
function wasmEntryToNormalized(
  entry: ParsedReqEntry,
  editable: boolean
): NormalizedRequirement {
  // Use parsed name, or derive from URL directory basename as fallback
  let name = entry.name || '';
  if (!name && entry.url) {
    const urlPath = entry.url.replace(/^file:\/\//, '');
    // For directory URLs (no file extension), use basename
    const basename = urlPath.replace(/\/$/, '').split('/').pop();
    if (basename && !basename.includes('.')) {
      name = basename;
    }
  }

  const req: NormalizedRequirement = {
    name,
  };

  if (entry.versionSpec) {
    req.version = entry.versionSpec;
  }

  if (entry.extras.length > 0) {
    req.extras = entry.extras;
  }

  if (entry.markers) {
    req.markers = entry.markers;
  }

  // Use VCS info from Rust-side parsing
  if (entry.vcs) {
    const source: DependencySource = {
      git: entry.vcs.url,
    };
    if (entry.vcs.rev) {
      source.rev = entry.vcs.rev;
    }
    if (editable) {
      source.editable = true;
    }
    req.source = source;
  }

  if (entry.url) {
    if (entry.url.startsWith('file://') && !entry.vcs) {
      // Use the original path as written by the user; fall back to stripping file://
      const given = entry.givenUrl ?? entry.url;
      const path = given.startsWith('file://')
        ? given.slice('file://'.length)
        : given;
      req.source = { path, ...(editable ? { editable: true } : {}) };
    } else {
      req.url = entry.url;
    }
  }

  if (entry.hashes.length > 0) {
    req.hashes = entry.hashes;
  }

  return req;
}

/**
 * Rebase a path from workingDir to packageRoot.
 * If the path is absolute, it's returned as-is.
 * If workingDir and packageRoot are the same (or either is missing), no rebasing occurs.
 */
function rebasePath(
  p: string,
  workingDir?: string,
  packageRoot?: string
): string {
  if (!workingDir || !packageRoot || workingDir === packageRoot) return p;
  if (isAbsolute(p)) return p;
  const abs = join(workingDir, p);
  const rel = relative(packageRoot, abs);
  if (isAbsolute(rel)) return rel;
  if (rel.startsWith('..')) return rel;
  return './' + rel;
}

/**
 * Convert a requirements.txt content to a pyproject.toml object suitable for uv.
 */
export async function convertRequirementsToPyprojectToml(
  fileContent: string,
  options?: ParseRequirementsOptions
): Promise<PyProjectToml> {
  const pyproject: PyProjectToml = {};

  const parsed = await parseRequirementsFile(fileContent, options);
  const deps: string[] = [];
  const sources: Record<string, DependencySource[]> = {};
  const { workingDir, packageRoot } = options ?? {};

  for (const req of parsed.requirements) {
    deps.push(formatPep508(req));

    // Collect sources for uv
    if (req.source) {
      const source = { ...req.source };
      if (source.path) {
        source.path = rebasePath(source.path, workingDir, packageRoot);
      }
      if (Object.prototype.hasOwnProperty.call(sources, req.name)) {
        sources[req.name].push(source);
      } else {
        sources[req.name] = [source];
      }
    }
  }

  pyproject.project = {
    name: 'app',
    version: '0.1.0',
    dependencies: deps,
  };

  // Build tool.uv section
  const uv: Record<string, unknown> = {};

  // Add index URLs from pip options
  const indexes = buildIndexEntries(parsed.pipOptions);
  if (indexes.length > 0) {
    uv.index = indexes;
  }

  // Add sources for git/path dependencies
  if (Object.keys(sources).length > 0) {
    uv.sources = sources;
  }

  if (Object.keys(uv).length > 0) {
    pyproject.tool = { uv };
  }

  return pyproject;
}

/**
 * Build index entries for tool.uv.index from pip options.
 */
function buildIndexEntries(pipOptions: PipOptions): UvIndexEntry[] {
  const indexes: UvIndexEntry[] = [];

  // Add primary index URL (--index-url / -i)
  // This replaces PyPI as the default index
  if (pipOptions.indexUrl) {
    indexes.push({
      name: PRIMARY_INDEX_NAME,
      url: pipOptions.indexUrl,
      default: true,
    });
  }

  // Add extra index URLs (--extra-index-url)
  for (let i = 0; i < pipOptions.extraIndexUrls.length; i++) {
    indexes.push({
      name: `${EXTRA_INDEX_PREFIX}${i + 1}`,
      url: pipOptions.extraIndexUrls[i],
    });
  }

  // Add find-links as flat indexes (--find-links / -f)
  if (pipOptions.findLinks) {
    for (let i = 0; i < pipOptions.findLinks.length; i++) {
      indexes.push({
        name: `${FIND_LINKS_PREFIX}${i + 1}`,
        url: pipOptions.findLinks[i],
        format: 'flat',
      });
    }
  }

  return indexes;
}

/**
 * Parse requirements file content with full pip options support.
 * The upstream WASM parser handles -r/-c recursion natively via the host-bridge.
 */
export async function parseRequirementsFile(
  fileContent: string,
  options?: ParseRequirementsOptions
): Promise<ParsedRequirementsFile> {
  const wasmResult = await parseWithWasm(
    fileContent,
    options?.readFile,
    options?.workingDir
  );
  return processWasmResult(wasmResult);
}

/**
 * Process WASM parser result into ParsedRequirementsFile.
 */
function processWasmResult(
  wasmResult: ParsedRequirementsTxt
): ParsedRequirementsFile {
  const normalized: NormalizedRequirement[] = [];

  // Process regular requirements
  for (const entry of wasmResult.requirements) {
    normalized.push(wasmEntryToNormalized(entry, false));
  }

  // Process editable requirements
  for (const entry of wasmResult.editables) {
    const norm = wasmEntryToNormalized(entry, true);
    // For editable local paths, ensure source is set
    if (!norm.source && !entry.vcs) {
      // Fallback: pep508 field contains the raw text for editables without a URL
      norm.source = { path: entry.pep508, editable: true };
    } else if (norm.source && !norm.source.editable) {
      norm.source.editable = true;
    }
    normalized.push(norm);
  }

  // Build pip options from WASM result
  const pipOptions: PipOptions = {
    indexUrl: wasmResult.indexUrl || undefined,
    extraIndexUrls: [...wasmResult.extraIndexUrls],
    findLinks:
      wasmResult.findLinks.length > 0 ? [...wasmResult.findLinks] : undefined,
    noIndex: wasmResult.noIndex || undefined,
  };

  return {
    requirements: normalized,
    pipOptions,
  };
}

export type { ReadFileFn };
