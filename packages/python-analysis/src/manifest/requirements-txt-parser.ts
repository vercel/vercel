/*
 * Convert requirements.txt and requirements.in to pyproject.toml
 */

/** Name for the primary index when --index-url is specified */
const PRIMARY_INDEX_NAME = 'primary';
/** Prefix for extra index names when --extra-index-url is specified */
const EXTRA_INDEX_PREFIX = 'extra-';
/** Prefix for flat index names when --find-links is specified */
const FIND_LINKS_PREFIX = 'find-links-';

import { normalize } from 'node:path';

import type {
  EnvironmentMarker,
  EnvironmentMarkerLeaf,
  EnvironmentMarkerNode,
  ProjectNameRequirement,
  ProjectURLRequirement,
  Requirement,
} from 'pip-requirements-js';
import { parsePipRequirementsFile } from 'pip-requirements-js';
import type { PyProjectToml } from './pyproject/types';
import type {
  DependencySource,
  HashDigest,
  NormalizedRequirement,
} from './requirement/types';
import type { UvIndexEntry } from './uv-config/types';
import { formatPep508 } from './pep508';

/**
 * Parsed pip arguments from requirements file.
 */
export interface PipOptions {
  /** Files referenced via -r or --requirement */
  requirementFiles: string[];
  /** Files referenced via -c or --constraint */
  constraintFiles: string[];
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
 * Function type for reading referenced requirement files.
 */
export type ReadFileFn = (path: string) => string | null;

/**
 * Parsed git URL components.
 */
interface ParsedGitUrl {
  /** The git repository URL (without the git+ prefix and without @ref or #egg) */
  url: string;
  /** Git reference (branch, tag, or commit hash) */
  ref?: string;
  /** Package name from #egg=name fragment */
  egg?: string;
  /** Whether this is an editable install (-e) */
  editable?: boolean;
}

/**
 * Parse a VCS URL from requirements.txt format.
 *
 * Supports formats like:
 * - git+https://github.com/user/repo.git@tag#egg=package
 * - git+ssh://git@github.com/user/repo.git@branch#egg=package
 * - git+https://github.com/user/repo@commit#egg=package&subdirectory=src
 *
 * @param url - The URL to parse (may include git+ prefix)
 * @returns Parsed components, or null if not a git URL
 */
function parseGitUrl(url: string): ParsedGitUrl | null {
  // Check if it's a git URL
  if (!url.startsWith('git+')) {
    return null;
  }

  // Remove the git+ prefix
  let remaining = url.slice(4);

  // Extract fragment (#egg=name&subdirectory=path)
  let egg: string | undefined;
  const fragmentIdx = remaining.indexOf('#');
  if (fragmentIdx !== -1) {
    const fragment = remaining.slice(fragmentIdx + 1);
    remaining = remaining.slice(0, fragmentIdx);

    // Handle both #egg=name format and #egg=name&subdirectory=path
    for (const part of fragment.split('&')) {
      const [key, value] = part.split('=');
      if (key === 'egg' && value) {
        egg = value;
      }
    }
  }

  // Extract ref (@tag, @branch, @commit)
  let ref: string | undefined;
  // Find the last @ that's not part of the username (e.g., git@github.com)
  // The ref @ comes after the path, so we look for @ after the last /
  const lastSlashIdx = remaining.lastIndexOf('/');
  const atIdx = remaining.indexOf('@', lastSlashIdx > 0 ? lastSlashIdx : 0);
  if (atIdx !== -1 && atIdx > remaining.indexOf('://')) {
    ref = remaining.slice(atIdx + 1);
    remaining = remaining.slice(0, atIdx);
  }

  return {
    url: remaining,
    ref,
    egg,
  };
}

/**
 * Check if a URL is a git VCS URL.
 */
function isGitUrl(url: string): boolean {
  return url.startsWith('git+');
}

/**
 * Pre-process requirements file content to extract pip arguments that
 * pip-requirements-js doesn't handle (long-form options and index URLs).
 *
 * Returns the cleaned content (with extracted lines removed) and the extracted options.
 */
function extractPipArguments(fileContent: string): {
  cleanedContent: string;
  options: PipOptions;
  pathRequirements: string[];
  editableRequirements: string[];
} {
  const options: PipOptions = {
    requirementFiles: [],
    constraintFiles: [],
    extraIndexUrls: [],
  };

  const lines = fileContent.split(/\r?\n/);
  const cleanedLines: string[] = [];
  const pathRequirements: string[] = [];
  const editableRequirements: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments - pass them through
    if (trimmed === '' || trimmed.startsWith('#')) {
      cleanedLines.push(line);
      continue;
    }

    // Handle line continuations - build the full logical line
    let fullLine = trimmed;
    let linesConsumed = 0;
    while (fullLine.endsWith('\\') && i + linesConsumed + 1 < lines.length) {
      linesConsumed++;
      fullLine = fullLine.slice(0, -1) + lines[i + linesConsumed].trim();
    }

    const extracted = tryExtractPipArgument(fullLine, options);
    if (extracted === true) {
      // Pip option was extracted into options
      i += linesConsumed;
    } else if (typeof extracted === 'object' && extracted.editable) {
      // Editable requirement (-e / --editable)
      editableRequirements.push(extracted.editable);
      i += linesConsumed;
    } else {
      // Not a pip argument. Check for unknown single-dash flags that
      // pip-requirements-js can't handle. -r and -c are handled by
      // pip-requirements-js so they pass through.
      if (
        /^-[a-zA-Z]/.test(fullLine) &&
        !fullLine.startsWith('-r') &&
        !fullLine.startsWith('-c')
      ) {
        // Unknown short flag, strip to prevent crash
        i += linesConsumed;
        continue;
      }

      // Not a standalone pip argument, but might have inline --hash
      // Strip --hash from the line and keep the requirement part
      const strippedLine = stripInlineHashes(fullLine);
      const effectiveLine = (
        strippedLine !== fullLine ? strippedLine : fullLine
      ).trim();

      if (isPathOrUrlRequirement(effectiveLine)) {
        // Bare file path or URL that pip-requirements-js can't parse
        pathRequirements.push(effectiveLine);
      } else if (strippedLine !== fullLine) {
        // Line had hashes, add the stripped version
        cleanedLines.push(strippedLine);
      } else {
        // No hashes, keep the original line(s)
        cleanedLines.push(line);
        // If we consumed continuation lines, add them back
        for (let j = 1; j <= linesConsumed; j++) {
          cleanedLines.push(lines[i + j]);
        }
      }
      i += linesConsumed;
    }
  }

  return {
    cleanedContent: cleanedLines.join('\n'),
    options,
    pathRequirements,
    editableRequirements,
  };
}

/**
 * Result from tryExtractPipArgument indicating what was found.
 * - false: not a pip argument
 * - true: a pip argument that was stored in options
 * - string: an editable path that needs separate processing
 */
type PipArgumentResult = boolean | { editable: string };

/**
 * Try to extract a pip argument from a line.
 * Returns false if the line is not a pip argument,
 * true if it was extracted into options,
 * or an object with the editable path for -e/--editable.
 */
function tryExtractPipArgument(
  line: string,
  options: PipOptions
): PipArgumentResult {
  // --requirement=<path> or --requirement <path>
  if (line.startsWith('--requirement')) {
    const path = extractArgValue(line, '--requirement');
    if (path) {
      options.requirementFiles.push(path);
      return true;
    }
  }

  // --constraint=<path> or --constraint <path>
  if (line.startsWith('--constraint')) {
    const path = extractArgValue(line, '--constraint');
    if (path) {
      options.constraintFiles.push(path);
      return true;
    }
  }

  // --index-url=<url> or --index-url <url>
  if (line.startsWith('--index-url')) {
    const url = extractArgValue(line, '--index-url');
    if (url) {
      // Only the last --index-url is used (pip behavior)
      options.indexUrl = url;
      return true;
    }
  }

  // -i <url> (short form for --index-url)
  if (line.startsWith('-i ') || line === '-i') {
    const match = line.match(/^-i\s+(\S+)/);
    if (match) {
      options.indexUrl = match[1];
      return true;
    }
  }

  // --extra-index-url=<url> or --extra-index-url <url>
  if (line.startsWith('--extra-index-url')) {
    const url = extractArgValue(line, '--extra-index-url');
    if (url) {
      options.extraIndexUrls.push(url);
      return true;
    }
  }

  // --editable=<path> or --editable <path>
  if (line.startsWith('--editable')) {
    const path = extractArgValue(line, '--editable');
    if (path) {
      return { editable: path };
    }
  }

  // -e <path> (short form for --editable)
  if (line.startsWith('-e ') || line.startsWith('-e\t')) {
    const path = line.slice(2).trim();
    if (path) {
      return { editable: path };
    }
  }

  // --find-links=<url> or --find-links <url>
  if (line.startsWith('--find-links')) {
    const url = extractArgValue(line, '--find-links');
    if (url) {
      if (!options.findLinks) options.findLinks = [];
      options.findLinks.push(url);
      return true;
    }
  }

  // -f <url> (short form for --find-links)
  if (line.startsWith('-f ') || line.startsWith('-f\t')) {
    const match = line.match(/^-f\s+(\S+)/);
    if (match) {
      if (!options.findLinks) options.findLinks = [];
      options.findLinks.push(match[1]);
      return true;
    }
  }

  // --no-index (boolean flag)
  if (line === '--no-index' || line.startsWith('--no-index ')) {
    options.noIndex = true;
    return true;
  }

  // --no-binary and --only-binary: strip to prevent crashes
  if (line.startsWith('--no-binary') || line.startsWith('--only-binary')) {
    return true;
  }

  // Catch-all: strip any unrecognized --option to prevent pip-requirements-js crashes.
  // Known pip options we don't need: --pre, --prefer-binary, --require-hashes,
  // --trusted-host, --use-feature, --config-settings, --global-option, etc.
  if (line.startsWith('--')) {
    return true;
  }

  return false;
}

/**
 * Strip inline --hash arguments from a requirement line.
 * Returns the line without the hash arguments.
 */
function stripInlineHashes(line: string): string {
  // Match --hash=algorithm:value patterns
  return line.replace(/\s+--hash=\S+/g, '').trim();
}

/**
 * Extract all --hash values from a requirement line.
 * Returns an array of hash strings in the format "algorithm:value".
 */
function extractInlineHashes(line: string): HashDigest[] {
  const hashes: HashDigest[] = [];
  const hashRegex = /--hash=(\S+)/g;
  let match;
  while ((match = hashRegex.exec(line)) != null) {
    hashes.push(match[1]);
  }
  return hashes;
}

/**
 * Extract the argument value from a line like "--option=value" or "--option value".
 * Strips inline comments (e.g., "value # comment" → "value").
 */
function extractArgValue(line: string, option: string): string | null {
  let value: string | null = null;

  // Check for --option=value format
  if (line.startsWith(`${option}=`)) {
    value = line.slice(option.length + 1).trim();
  }
  // Check for --option value format
  else if (line.startsWith(`${option} `) || line.startsWith(`${option}\t`)) {
    value = line.slice(option.length).trim();
  }

  if (!value) return null;

  // Strip inline comments (space + # + anything)
  const commentIdx = value.indexOf(' #');
  if (commentIdx !== -1) {
    value = value.slice(0, commentIdx).trim();
  }

  return value || null;
}

/**
 * Check if a requirements line is a bare file path or URL requirement
 * (as opposed to a PEP 508 `name @ url` requirement or a pip option).
 *
 * These are valid in requirements.txt but not handled by pip-requirements-js:
 * - ./relative/path/to/pkg.whl
 * - ../parent/path/to/pkg.tar.gz
 * - /absolute/path/to/pkg.whl
 * - ~/path/to/pkg.whl
 * - https://example.com/pkg.tar.gz
 * - file:///path/to/pkg.whl
 */
function isPathOrUrlRequirement(line: string): boolean {
  // Relative paths
  if (line.startsWith('./') || line.startsWith('../')) return true;
  // Absolute paths
  if (line.startsWith('/')) return true;
  // Home-relative paths
  if (line.startsWith('~/')) return true;
  // Bare URLs (not preceded by package name + @)
  if (/^(https?|ftp|file):\/\//i.test(line)) return true;
  // Bare archive filenames without path prefix (e.g., "pkg-1.0.0-py3-none-any.whl")
  if (isBareArchiveFilename(line)) return true;
  return false;
}

/**
 * Check if a line looks like a bare archive filename (no path prefix).
 * Strips extras, markers, and comments before checking the extension.
 */
function isBareArchiveFilename(line: string): boolean {
  // PEP 508 "name @ url" requirements are handled by pip-requirements-js
  if (line.includes(' @ ')) return false;

  let check = line;
  // Strip inline comments
  const commentIdx = check.indexOf(' #');
  if (commentIdx !== -1) check = check.slice(0, commentIdx);
  // Strip environment markers
  const markerIdx = check.indexOf(' ;');
  if (markerIdx !== -1) check = check.slice(0, markerIdx);
  // Strip extras
  const extrasIdx = check.indexOf('[');
  if (extrasIdx !== -1) check = check.slice(0, extrasIdx);
  check = check.trim();

  return /\.(whl|tar\.gz|tar\.bz2|tar\.xz|zip)$/i.test(check);
}

/**
 * Parse a wheel filename to extract the distribution name and version.
 *
 * Wheel filename format (PEP 427):
 * {distribution}-{version}(-{build tag})?-{python tag}-{abi tag}-{platform tag}.whl
 *
 * @returns Object with name (PEP 503 normalized) and version, or null if not a valid wheel filename
 */
function parseWheelFilename(
  filename: string
): { name: string; version: string } | null {
  if (!filename.endsWith('.whl')) return null;
  const stem = filename.slice(0, -4);
  const parts = stem.split('-');

  // 5 parts: name-version-python-abi-platform
  // 6 parts: name-version-build-python-abi-platform
  if (parts.length < 5 || parts.length > 6) return null;

  const name = parts[0];
  const version = parts[1];
  if (!name || !version) return null;

  // Normalize distribution name: underscores → hyphens (PEP 503)
  return {
    name: name.replace(/_/g, '-'),
    version,
  };
}

/**
 * Parse an sdist filename to extract the distribution name and version.
 *
 * Common sdist formats: {name}-{version}.tar.gz, {name}-{version}.zip, etc.
 *
 * @returns Object with name and version, or null if not a valid sdist filename
 */
function parseSdistFilename(
  filename: string
): { name: string; version: string } | null {
  // Remove known archive extensions
  let stem = filename;
  for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip']) {
    if (stem.endsWith(ext)) {
      stem = stem.slice(0, -ext.length);
      break;
    }
  }
  if (stem === filename) return null; // no recognized extension

  // Split on '-' and find the first part that starts with a digit (the version)
  const parts = stem.split('-');
  let versionIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d/.test(parts[i])) {
      versionIdx = i;
      break;
    }
  }

  if (versionIdx === -1) return null;

  return {
    name: parts.slice(0, versionIdx).join('-'),
    version: parts.slice(versionIdx).join('-'),
  };
}

/**
 * Convert a bare file path or URL requirement into a NormalizedRequirement.
 *
 * Handles:
 * - Wheel files (.whl) with PEP 427 filename format
 * - Source distribution archives (.tar.gz, .zip, etc.)
 * - Directory paths (uses last component as package name)
 * - Inline comments (# ...) and environment markers (; ...)
 * - Extras ([extra1,extra2])
 */
function normalizePathRequirement(
  rawLine: string
): NormalizedRequirement | null {
  let line = rawLine;

  // Strip inline comments (space + # + anything)
  const commentIdx = line.indexOf(' #');
  if (commentIdx !== -1) {
    line = line.slice(0, commentIdx).trim();
  }

  // Extract environment markers (; markers)
  let markers: string | undefined;
  const markerIdx = line.indexOf(' ;');
  if (markerIdx !== -1) {
    markers = line.slice(markerIdx + 2).trim();
    line = line.slice(0, markerIdx).trim();
  }

  // Extract extras ([extra1,extra2])
  let extras: string[] | undefined;
  const extrasMatch = line.match(/\[([^\]]+)\]$/);
  if (extrasMatch) {
    extras = extrasMatch[1].split(',').map(e => e.trim());
    line = line.slice(0, extrasMatch.index).trim();
  }

  // Now `line` is the bare path or URL
  const isUrl = /^(https?|ftp|file):\/\//i.test(line);

  // Extract the filename from the path or URL
  let filename: string;
  if (isUrl) {
    try {
      const url = new URL(line);
      filename = url.pathname.split('/').pop() || '';
    } catch {
      return null;
    }
  } else {
    // Strip trailing slashes for directory paths
    const cleanPath = line.replace(/\/+$/, '');
    filename = cleanPath.split('/').pop() || '';
  }

  if (!filename) return null;

  // Try to parse as wheel filename
  let name: string | undefined;
  let version: string | undefined;

  const wheelParsed = parseWheelFilename(filename);
  if (wheelParsed) {
    name = wheelParsed.name;
    version = wheelParsed.version;
  }

  if (!name) {
    // Try to parse as sdist filename
    const sdistParsed = parseSdistFilename(filename);
    if (sdistParsed) {
      name = sdistParsed.name;
      version = sdistParsed.version;
    }
  }

  if (!name) {
    // Use last path component as name (for directory paths)
    // Normalize: replace underscores with hyphens, lowercase (PEP 503)
    name = filename.replace(/[-_.]+/g, '-').toLowerCase();
  }

  if (!name) return null;

  const req: NormalizedRequirement = { name };

  if (version) {
    req.version = `==${version}`;
  }

  if (extras && extras.length > 0) {
    req.extras = extras;
  }

  if (markers) {
    req.markers = markers;
  }

  if (isUrl) {
    req.url = line;
  } else {
    req.source = { path: line };
  }

  return req;
}

/**
 * Convert a requirements.txt content to a pyproject.toml object suitable for uv.
 *
 * This creates a minimal pyproject:
 *
 * [project]
 * dependencies = [...]
 *
 * [tool.uv.sources]
 * package = { git = "..." }
 *
 * Note: Hash information is not included in pyproject.toml output.
 *
 * @param fileContent - The content of the requirements.txt file
 * @param readFile - Optional function to read referenced requirement files (-r, --requirement).
 *                   If provided, referenced files will be recursively processed.
 */
export function convertRequirementsToPyprojectToml(
  fileContent: string,
  readFile?: ReadFileFn
): PyProjectToml {
  const pyproject: PyProjectToml = {};

  const parsed = parseRequirementsFile(fileContent, readFile);
  const deps: string[] = [];
  const sources: Record<string, DependencySource[]> = {};

  for (const req of parsed.requirements) {
    deps.push(formatPep508(req));

    // Collect sources for uv
    if (req.source) {
      if (Object.prototype.hasOwnProperty.call(sources, req.name)) {
        sources[req.name].push(req.source);
      } else {
        sources[req.name] = [req.source];
      }
    }
  }

  if (deps.length > 0) {
    pyproject.project = {
      name: 'app',
      version: '0.1.0',
      dependencies: deps,
    };
  }

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
 * Returns both the normalized requirements and the parsed pip options
 * (--requirement, --constraint, --index-url, --extra-index-url, --hash).
 *
 * @param fileContent - The content of the requirements.txt file
 * @param readFile - Optional function to read referenced requirement files (-r, --requirement).
 *                   If provided, referenced files will be recursively processed and their
 *                   requirements merged into the result.
 */
export function parseRequirementsFile(
  fileContent: string,
  readFile?: ReadFileFn
): ParsedRequirementsFile {
  const visited = new Set<string>();
  return parseRequirementsFileInternal(fileContent, readFile, visited);
}

/**
 * Internal implementation that tracks visited files to prevent circular references.
 */
function parseRequirementsFileInternal(
  fileContent: string,
  readFile: ReadFileFn | undefined,
  visited: Set<string>
): ParsedRequirementsFile {
  const { cleanedContent, options, pathRequirements, editableRequirements } =
    extractPipArguments(fileContent);

  // Build a map from requirement name to hashes from the original content
  const hashMap = buildHashMap(fileContent);

  const requirements = parsePipRequirementsFile(cleanedContent);
  const normalized: NormalizedRequirement[] = [];

  // Collect all pip options (will be merged with referenced files)
  const mergedOptions: PipOptions = {
    requirementFiles: [...options.requirementFiles],
    constraintFiles: [...options.constraintFiles],
    indexUrl: options.indexUrl,
    extraIndexUrls: [...options.extraIndexUrls],
    findLinks: options.findLinks ? [...options.findLinks] : undefined,
    noIndex: options.noIndex,
  };

  for (const req of requirements) {
    // Also collect -r and -c references from pip-requirements-js
    if (req.type === 'RequirementsFile') {
      mergedOptions.requirementFiles.push(req.path);
      continue;
    }
    if (req.type === 'ConstraintsFile') {
      mergedOptions.constraintFiles.push(req.path);
      continue;
    }

    const norm = normalizeRequirement(req);
    if (norm != null) {
      // Attach hashes if present
      const hashes = hashMap.get(norm.name.toLowerCase());
      if (hashes && hashes.length > 0) {
        norm.hashes = hashes;
      }
      normalized.push(norm);
    }
  }

  // Process bare file path and URL requirements that pip-requirements-js can't parse
  for (const rawPath of pathRequirements) {
    const norm = normalizePathRequirement(rawPath);
    if (norm != null) {
      normalized.push(norm);
    }
  }

  // Process editable requirements (-e / --editable)
  for (const rawPath of editableRequirements) {
    const norm = normalizePathRequirement(rawPath);
    if (norm != null) {
      if (norm.source) {
        norm.source.editable = true;
      } else {
        norm.source = { path: rawPath, editable: true };
      }
      normalized.push(norm);
    }
  }

  // If readFile is provided, recursively process referenced requirement files
  if (readFile) {
    for (const refPath of mergedOptions.requirementFiles) {
      // Normalize the path for cycle detection to handle variations like
      // "./base.txt" vs "base.txt" vs "foo/../base.txt"
      const refPathKey = normalize(refPath);

      // Skip if already visited (prevent circular references)
      if (visited.has(refPathKey)) {
        continue;
      }
      visited.add(refPathKey);

      const refContent = readFile(refPath);
      if (refContent != null) {
        const refParsed = parseRequirementsFileInternal(
          refContent,
          readFile,
          visited
        );

        // Merge requirements (avoiding duplicates by name)
        const existingNames = new Set(
          normalized.map(r => r.name.toLowerCase())
        );
        for (const req of refParsed.requirements) {
          if (!existingNames.has(req.name.toLowerCase())) {
            normalized.push(req);
            existingNames.add(req.name.toLowerCase());
          }
        }

        // Merge pip options
        // Index URL: later files take precedence
        if (refParsed.pipOptions.indexUrl) {
          mergedOptions.indexUrl = refParsed.pipOptions.indexUrl;
        }

        // Extra index URLs: collect all unique ones
        for (const url of refParsed.pipOptions.extraIndexUrls) {
          if (!mergedOptions.extraIndexUrls.includes(url)) {
            mergedOptions.extraIndexUrls.push(url);
          }
        }

        // Constraint files: collect all unique ones
        for (const constraintPath of refParsed.pipOptions.constraintFiles) {
          if (!mergedOptions.constraintFiles.includes(constraintPath)) {
            mergedOptions.constraintFiles.push(constraintPath);
          }
        }

        // Find links: collect all unique ones
        if (refParsed.pipOptions.findLinks) {
          if (!mergedOptions.findLinks) mergedOptions.findLinks = [];
          for (const fl of refParsed.pipOptions.findLinks) {
            if (!mergedOptions.findLinks.includes(fl)) {
              mergedOptions.findLinks.push(fl);
            }
          }
        }

        // No index: any file setting it takes effect
        if (refParsed.pipOptions.noIndex) {
          mergedOptions.noIndex = true;
        }

        // Requirement files are already tracked via visited set
      }
    }
  }

  return {
    requirements: normalized,
    pipOptions: mergedOptions,
  };
}

/**
 * Build a map from package name to hashes from the original file content.
 */
function buildHashMap(fileContent: string): Map<string, HashDigest[]> {
  const hashMap = new Map<string, HashDigest[]>();
  const lines = fileContent.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#') || line.startsWith('-')) {
      continue;
    }

    // Handle line continuations
    while (line.endsWith('\\') && i + 1 < lines.length) {
      i++;
      line = line.slice(0, -1) + lines[i].trim();
    }

    // Extract hashes from the line
    const hashes = extractInlineHashes(line);
    if (hashes.length === 0) {
      continue;
    }

    // Extract package name (first word before any version specifier, extras, etc.)
    const packageMatch = line.match(/^([a-zA-Z0-9][-a-zA-Z0-9._]*)/);
    if (packageMatch) {
      const packageName = packageMatch[1].toLowerCase();
      hashMap.set(packageName, hashes);
    }
  }

  return hashMap;
}

function normalizeRequirement(req: Requirement): NormalizedRequirement | null {
  if (req.type === 'RequirementsFile' || req.type === 'ConstraintsFile') {
    // Skip -r and -c directives - these reference other files
    return null;
  }

  if (req.type === 'ProjectURL') {
    return normalizeProjectURLRequirement(req);
  }

  if (req.type === 'ProjectName') {
    return normalizeProjectNameRequirement(req);
  }

  return null;
}

function normalizeProjectNameRequirement(
  req: ProjectNameRequirement
): NormalizedRequirement {
  const normalized: NormalizedRequirement = {
    name: req.name,
  };

  if (req.extras && req.extras.length > 0) {
    normalized.extras = req.extras;
  }

  if (req.versionSpec && req.versionSpec.length > 0) {
    // Combine all version specs into a single version string
    // e.g., [{ operator: '>=', version: '1.0' }, { operator: '<', version: '2.0' }]
    // becomes '>=1.0,<2.0'
    normalized.version = req.versionSpec
      .map(spec => `${spec.operator}${spec.version}`)
      .join(',');
  }

  if (req.environmentMarkerTree) {
    normalized.markers = formatEnvironmentMarkers(req.environmentMarkerTree);
  }

  return normalized;
}

function normalizeProjectURLRequirement(
  req: ProjectURLRequirement
): NormalizedRequirement {
  const normalized: NormalizedRequirement = {
    name: req.name,
  };

  if (req.extras && req.extras.length > 0) {
    normalized.extras = req.extras;
  }

  if (req.environmentMarkerTree) {
    normalized.markers = formatEnvironmentMarkers(req.environmentMarkerTree);
  }

  // Check if this is a git URL and parse it
  if (isGitUrl(req.url)) {
    const parsed = parseGitUrl(req.url);
    if (parsed) {
      // Create source for tool.uv.sources
      const source: DependencySource = {
        git: parsed.url,
      };
      if (parsed.ref) {
        source.rev = parsed.ref;
      }
      if (parsed.editable) {
        source.editable = true;
      }
      normalized.source = source;
    }
  }

  // For PEP 508, we still use the original URL format
  // uv understands git+https:// URLs in the @ syntax
  normalized.url = req.url;

  return normalized;
}

/**
 * Format environment markers back to their string representation.
 */
function formatEnvironmentMarkers(marker: EnvironmentMarker): string {
  if (isEnvironmentMarkerNode(marker)) {
    const left = formatEnvironmentMarkers(marker.left);
    const right = formatEnvironmentMarkers(marker.right);
    return `(${left}) ${marker.operator} (${right})`;
  }

  // It's a leaf node
  const leaf = marker as EnvironmentMarkerLeaf;
  const leftStr = formatMarkerValue(leaf.left);
  const rightStr = formatMarkerValue(leaf.right);
  return `${leftStr} ${leaf.operator} ${rightStr}`;
}

/**
 * Type guard to check if marker is a node (has and/or operator with left/right subtrees)
 * vs a leaf (has comparison operator with left/right values).
 *
 * Both EnvironmentMarkerNode and EnvironmentMarkerLeaf have 'left', 'right', and 'operator',
 * but a Node's operator is 'and' | 'or' while a Leaf's operator is a comparison operator.
 */
function isEnvironmentMarkerNode(
  marker: EnvironmentMarker
): marker is EnvironmentMarkerNode {
  // Check if it's an object with the operator property
  if (typeof marker !== 'object' || marker == null) {
    return false;
  }

  // A node has 'and' or 'or' as the operator
  const op = (marker as EnvironmentMarkerNode).operator;
  return op === 'and' || op === 'or';
}

function formatMarkerValue(value: string): string {
  // If it's already a quoted string (PythonString type), return as-is
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value;
  }
  // Otherwise it's an EnvironmentMarkerVariable, return as-is
  return value;
}
