import fs from 'fs';
import { join, resolve, sep } from 'path';
import { FileFsRef, Files, debug } from '@vercel/build-utils';
import {
  normalizePackageName,
  scanDistributions,
} from '@vercel/python-analysis';
import { getVenvSitePackagesDirs } from './install';

// AWS Lambda uncompressed size limit is 250MB, but we use 249MB to leave a small buffer
export const LAMBDA_SIZE_THRESHOLD_BYTES = 249 * 1024 * 1024;

// Target size for packing dependencies into the Lambda bundle.
// Defaults to 245MB but can be overridden via VERCEL_PYTHON_PACKING_TARGET_MB.
const packingTargetMB = parseInt(
  process.env.VERCEL_PYTHON_PACKING_TARGET_MB || '245',
  10
);
export const LAMBDA_PACKING_TARGET_BYTES =
  (Number.isFinite(packingTargetMB) && packingTargetMB > 0
    ? packingTargetMB
    : 245) *
  1024 *
  1024;

// AWS Lambda ephemeral storage (/tmp) is 512MB. Use 500MB to leave a buffer
// for runtime overhead (.pyc generation, uv cache, metadata, etc.)
export const LAMBDA_EPHEMERAL_STORAGE_BYTES = 500 * 1024 * 1024;

export async function mirrorSitePackagesIntoVendor({
  venvPath,
  vendorDirName,
}: {
  venvPath: string;
  vendorDirName: string;
}): Promise<Files> {
  const vendorFiles: Files = {};
  try {
    const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);
    for (const dir of sitePackageDirs) {
      if (!fs.existsSync(dir)) continue;

      const resolvedDir = resolve(dir);
      const dirPrefix = resolvedDir + sep;
      const distributions = await scanDistributions(dir);
      for (const dist of distributions.values()) {
        for (const { path: rawPath } of dist.files) {
          // Normalize forward slashes from RECORD (PEP 376) to platform separators.
          const filePath = rawPath.replaceAll('/', sep);
          // Skip files installed outside site-packages (e.g. ../../bin/fastapi)
          if (!resolve(resolvedDir, filePath).startsWith(dirPrefix)) {
            continue;
          }
          if (
            filePath.endsWith('.pyc') ||
            filePath.split(sep).includes('__pycache__')
          ) {
            continue;
          }
          const srcFsPath = join(dir, filePath);
          const bundlePath = join(vendorDirName, filePath).replace(/\\/g, '/');
          vendorFiles[bundlePath] = new FileFsRef({ fsPath: srcFsPath });
        }
      }
    }
  } catch (err) {
    console.log('Failed to collect site-packages from virtual environment');
    throw err;
  }

  return vendorFiles;
}

/**
 * Calculate the total uncompressed size of files in a Files object.
 */
export async function calculateBundleSize(files: Files): Promise<number> {
  let totalSize = 0;

  for (const filePath of Object.keys(files)) {
    const file = files[filePath];
    if ('fsPath' in file && file.fsPath) {
      try {
        const stats = await fs.promises.stat(file.fsPath);
        totalSize += stats.size;
      } catch (err) {
        console.warn(
          `Warning: Failed to stat file ${file.fsPath}, size will not be included in bundle calculation: ${err}`
        );
      }
    } else if ('data' in file) {
      // FileBlob with data
      const data = (file as { data: string | Buffer }).data;
      totalSize +=
        typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    }
  }

  return totalSize;
}

/**
 * Mirror only private packages from site-packages into the _vendor directory.
 */
export async function mirrorPrivatePackagesIntoVendor({
  venvPath,
  vendorDirName,
  privatePackages,
}: {
  venvPath: string;
  vendorDirName: string;
  privatePackages: string[];
}): Promise<Files> {
  const vendorFiles: Files = {};

  if (privatePackages.length === 0) {
    debug('No private packages to bundle');
    return vendorFiles;
  }

  const privatePackageSet = new Set(privatePackages.map(normalizePackageName));

  try {
    const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);
    for (const dir of sitePackageDirs) {
      if (!fs.existsSync(dir)) continue;

      const resolvedDir = resolve(dir);
      const dirPrefix = resolvedDir + sep;
      const distributions = await scanDistributions(dir);
      for (const [name, dist] of distributions) {
        if (!privatePackageSet.has(name)) continue;

        for (const { path: rawPath } of dist.files) {
          // Normalize forward slashes from RECORD (PEP 376) to platform separators.
          const filePath = rawPath.replaceAll('/', sep);
          // Skip files installed outside site-packages (e.g. ../../bin/fastapi)
          if (!resolve(resolvedDir, filePath).startsWith(dirPrefix)) {
            continue;
          }
          if (
            filePath.endsWith('.pyc') ||
            filePath.split(sep).includes('__pycache__')
          ) {
            continue;
          }
          const srcFsPath = join(dir, filePath);
          const bundlePath = join(vendorDirName, filePath).replace(/\\/g, '/');
          vendorFiles[bundlePath] = new FileFsRef({ fsPath: srcFsPath });
        }
      }
    }

    debug(
      `Bundled ${Object.keys(vendorFiles).length} files from private packages`
    );
  } catch (err) {
    console.log('Failed to collect private packages from virtual environment');
    throw err;
  }

  return vendorFiles;
}

/**
 * Greedy largest-first knapsack packing algorithm.
 *
 * Given a map of package names to sizes (in bytes) and a capacity,
 * selects packages to bundle into the Lambda zip to fill as much of
 * the capacity as possible.
 *
 * Packages are sorted by size descending and greedily selected if they
 * fit within the remaining capacity.
 */
export function lambdaKnapsack(
  packages: Map<string, number>,
  capacity: number
): string[] {
  if (capacity <= 0) {
    return [...packages.keys()];
  }

  // Sort by size descending so we pack the largest packages first.
  const sorted = [...packages.entries()].sort(([, a], [, b]) => b - a);

  const bundled: string[] = [];
  let remaining = capacity;
  for (const [name, size] of sorted) {
    if (size <= remaining) {
      bundled.push(name);
      remaining -= size;
    }
  }

  return bundled;
}

/**
 * Calculate the uncompressed size of each installed distribution.
 *
 * Returns a map of normalized package name to total size in bytes,
 * measured from the actual files on disk.
 */
export async function calculatePerPackageSizes(
  venvPath: string
): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);

  for (const dir of sitePackageDirs) {
    if (!fs.existsSync(dir)) continue;

    const resolvedDir = resolve(dir);
    const dirPrefix = resolvedDir + sep;
    const distributions = await scanDistributions(dir);

    for (const [name, dist] of distributions) {
      let totalSize = 0;

      for (const { path: rawPath } of dist.files) {
        const filePath = rawPath.replaceAll('/', sep);
        // Skip files outside site-packages
        if (!resolve(resolvedDir, filePath).startsWith(dirPrefix)) {
          continue;
        }
        // Skip .pyc and __pycache__
        if (
          filePath.endsWith('.pyc') ||
          filePath.split(sep).includes('__pycache__')
        ) {
          continue;
        }
        try {
          const stats = await fs.promises.stat(join(dir, filePath));
          totalSize += stats.size;
        } catch {
          // File listed in RECORD but missing on disk; skip it
        }
      }

      sizes.set(name, totalSize);
    }
  }

  return sizes;
}

/**
 * Mirror a specific set of packages from site-packages into the _vendor directory.
 */
export async function mirrorSelectedPackagesIntoVendor({
  venvPath,
  vendorDirName,
  selectedPackages,
}: {
  venvPath: string;
  vendorDirName: string;
  selectedPackages: string[];
}): Promise<Files> {
  const vendorFiles: Files = {};

  if (selectedPackages.length === 0) {
    debug('No packages to bundle');
    return vendorFiles;
  }

  const packageSet = new Set(selectedPackages.map(normalizePackageName));

  try {
    const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);
    for (const dir of sitePackageDirs) {
      if (!fs.existsSync(dir)) continue;

      const resolvedDir = resolve(dir);
      const dirPrefix = resolvedDir + sep;
      const distributions = await scanDistributions(dir);
      for (const [name, dist] of distributions) {
        if (!packageSet.has(name)) continue;

        for (const { path: rawPath } of dist.files) {
          const filePath = rawPath.replaceAll('/', sep);
          if (!resolve(resolvedDir, filePath).startsWith(dirPrefix)) {
            continue;
          }
          if (
            filePath.endsWith('.pyc') ||
            filePath.split(sep).includes('__pycache__')
          ) {
            continue;
          }
          const srcFsPath = join(dir, filePath);
          const bundlePath = join(vendorDirName, filePath).replace(/\\/g, '/');
          vendorFiles[bundlePath] = new FileFsRef({ fsPath: srcFsPath });
        }
      }
    }

    debug(
      `Bundled ${Object.keys(vendorFiles).length} files from ${selectedPackages.length} packages`
    );
  } catch (err) {
    console.log('Failed to collect packages from virtual environment');
    throw err;
  }

  return vendorFiles;
}
