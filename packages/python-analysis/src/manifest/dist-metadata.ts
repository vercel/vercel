/**
 * Installed distribution metadata scanning.
 *
 * Scans a site-packages directory for .dist-info subdirectories and parses
 * their metadata using WASM-based parsers.
 *
 * Nomenclature strives to follow that of Python's importlib.metadata module:
 * https://docs.python.org/3/library/importlib.metadata.html
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { importWasmModule } from '../wasm/load';

/** A file record from a RECORD file (analogous to importlib.metadata.PackagePath). */
export interface PackagePath {
  path: string;
  hash?: string;
  size?: bigint;
}

/** PEP 610 direct URL origin info (analogous to importlib.metadata.Distribution.origin). */
export type DirectUrlInfo =
  | { tag: 'local-directory'; val: { url: string; editable: boolean } }
  | { tag: 'archive'; val: { url: string; hash?: string } }
  | {
      tag: 'vcs';
      val: {
        url: string;
        vcs: string;
        commitId?: string;
        requestedRevision?: string;
      };
    };

/**
 * An installed distribution parsed from a .dist-info directory.
 * Analogous to importlib.metadata.Distribution.
 */
export interface Distribution {
  /** Normalized package name (PEP 503). */
  name: string;
  /** Package version string. */
  version: string;
  /** Metadata version (e.g. "2.1", "2.3"). */
  metadataVersion: string;
  /** One-line summary. */
  summary?: string;
  /** Full description. */
  description?: string;
  /** Description content type (e.g. "text/markdown"). */
  descriptionContentType?: string;
  /** PEP 508 dependency specifiers (analogous to importlib.metadata.requires()). */
  requiresDist: string[];
  /** Python version requirement (e.g. ">=3.8"). */
  requiresPython?: string;
  /** Extra names provided by this distribution. */
  providesExtra: string[];
  /** Author name. */
  author?: string;
  /** Author email. */
  authorEmail?: string;
  /** Maintainer name. */
  maintainer?: string;
  /** Maintainer email. */
  maintainerEmail?: string;
  /** License text. */
  license?: string;
  /** SPDX license expression. */
  licenseExpression?: string;
  /** Trove classifiers. */
  classifiers: string[];
  /** Home page URL. */
  homePage?: string;
  /** Project URLs as [label, url] pairs. */
  projectUrls: [string, string][];
  /** Supported platforms. */
  platforms: string[];
  /** Dynamic metadata fields. */
  dynamic: string[];
  /** Installed files from RECORD (analogous to importlib.metadata.files()). */
  files: PackagePath[];
  /** PEP 610 origin info (analogous to importlib.metadata.Distribution.origin). */
  origin?: DirectUrlInfo;
  /** Installer tool name (from INSTALLER file). */
  installer?: string;
}

/** Map of normalized package name to distribution info. */
export type DistributionIndex = Map<string, Distribution>;

/**
 * Read a file from a .dist-info directory, returning undefined if not found.
 */
async function readDistInfoFile(
  distInfoDir: string,
  filename: string
): Promise<string | undefined> {
  try {
    return await readFile(join(distInfoDir, filename), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Scan a site-packages directory for installed distributions.
 *
 * Reads .dist-info directories and parses their METADATA, RECORD,
 * direct_url.json, and INSTALLER files.
 *
 * Analogous to importlib.metadata.distributions() but returns an indexed map.
 *
 * @param sitePackagesDir - Absolute path to a site-packages directory
 * @returns Map of normalized package name to distribution info
 */
export async function scanDistributions(
  sitePackagesDir: string
): Promise<DistributionIndex> {
  const mod = await importWasmModule();
  const index: DistributionIndex = new Map();

  // List all .dist-info directories
  let entries: string[];
  try {
    entries = await readdir(sitePackagesDir);
  } catch {
    return index;
  }

  const distInfoDirs = entries.filter(e => e.endsWith('.dist-info'));

  for (const dirName of distInfoDirs) {
    const distInfoPath = join(sitePackagesDir, dirName);

    // METADATA is required
    let metadataContent: Buffer;
    try {
      metadataContent = await readFile(join(distInfoPath, 'METADATA'));
    } catch {
      continue; // Skip if no METADATA
    }

    // Parse METADATA via WASM
    let metadata;
    try {
      metadata = mod.parseDistMetadata(new Uint8Array(metadataContent));
    } catch {
      continue; // Skip unparseable metadata
    }

    // Normalize the package name
    const normalizedName = mod.normalizePackageName(metadata.name);

    // Parse RECORD (optional) — analogous to Distribution.files
    let files: PackagePath[] = [];
    const recordContent = await readDistInfoFile(distInfoPath, 'RECORD');
    if (recordContent) {
      try {
        files = mod.parseRecord(recordContent);
      } catch {
        // Non-fatal: proceed without RECORD
      }
    }

    // Parse direct_url.json (optional) — analogous to Distribution.origin
    let origin: DirectUrlInfo | undefined;
    const directUrlContent = await readDistInfoFile(
      distInfoPath,
      'direct_url.json'
    );
    if (directUrlContent) {
      try {
        origin = mod.parseDirectUrl(directUrlContent);
      } catch {
        // Non-fatal: proceed without origin info
      }
    }

    // Read INSTALLER (optional)
    const installerContent = await readDistInfoFile(distInfoPath, 'INSTALLER');
    const installer = installerContent?.trim() || undefined;

    const dist: Distribution = {
      name: normalizedName,
      version: metadata.version,
      metadataVersion: metadata.metadataVersion,
      summary: metadata.summary,
      description: metadata.description,
      descriptionContentType: metadata.descriptionContentType,
      requiresDist: metadata.requiresDist,
      requiresPython: metadata.requiresPython,
      providesExtra: metadata.providesExtra,
      author: metadata.author,
      authorEmail: metadata.authorEmail,
      maintainer: metadata.maintainer,
      maintainerEmail: metadata.maintainerEmail,
      license: metadata.license,
      licenseExpression: metadata.licenseExpression,
      classifiers: metadata.classifiers,
      homePage: metadata.homePage,
      projectUrls: metadata.projectUrls,
      platforms: metadata.platforms,
      dynamic: metadata.dynamic,
      files,
      origin,
      installer,
    };

    index.set(normalizedName, dist);
  }

  return index;
}
