import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getErrorMessage } from './errutils';
import { getDirectoriesBetween, statIfExists } from './fsutils';

/**
 * Explains why a `node_modules` directory should be skipped, or `null` if safe.
 */
export async function getSkippedNodeModulesReason(
  nodeModulesDirectory: string,
  parentDirectories?: string[]
): Promise<string | null> {
  const parentDirectory = path.dirname(nodeModulesDirectory);
  parentDirectories ??= [parentDirectory];

  for (const directory of parentDirectories) {
    let unsafeParentReason: string | null;

    try {
      unsafeParentReason = await getUnsafeDirectoryReason(directory);
    } catch (error) {
      unsafeParentReason = `could not inspect: ${getErrorMessage(error)}`;
    }

    if (unsafeParentReason) {
      return `${directory} is ${unsafeParentReason}`;
    }
  }

  const result = await statIfExists(nodeModulesDirectory);

  if ('missing' in result) {
    return null;
  }

  if ('reason' in result) {
    return result.reason;
  }

  if (!result.stats.isDirectory()) {
    return 'not a directory';
  }

  const unsafeNodeModulesReason = getUnsafeStatsReason(result.stats);

  if (unsafeNodeModulesReason) {
    return unsafeNodeModulesReason;
  }

  return await getSkippedLocalBinDirectoryReason(
    path.join(nodeModulesDirectory, '.bin')
  );
}

/**
 * Explains why a `.bin` directory should be skipped, or `null` if safe.
 */
async function getSkippedLocalBinDirectoryReason(
  localBinDirectory: string
): Promise<string | null> {
  const result = await statIfExists(localBinDirectory);

  if ('missing' in result) {
    return null;
  }

  if ('reason' in result) {
    return `${localBinDirectory} ${result.reason}`;
  }

  if (!result.stats.isDirectory()) {
    return `${localBinDirectory} is not a directory`;
  }

  const unsafeLocalBinReason = getUnsafeStatsReason(result.stats);

  return unsafeLocalBinReason
    ? `${localBinDirectory} is ${unsafeLocalBinReason}`
    : null;
}

/**
 * Validates package and file paths for a declared package bin target.
 */
export async function getUnsafePackageBinReason(
  nodeModulesDirectory: string,
  packageDirectory: string,
  binPath: string
): Promise<string | null> {
  const unsafePackageDirectoryReason = await getUnsafePackageDirectoryReason(
    nodeModulesDirectory,
    packageDirectory
  );

  if (unsafePackageDirectoryReason) {
    return unsafePackageDirectoryReason;
  }

  return await getUnsafePackageFileReason(packageDirectory, binPath);
}

/**
 * Validates that each package directory segment is safe and under node_modules.
 */
export async function getUnsafePackageDirectoryReason(
  nodeModulesDirectory: string,
  packageDirectory: string
): Promise<string | null> {
  const directoriesToCheck = getDirectoriesBetween(
    nodeModulesDirectory,
    packageDirectory
  );

  if (directoriesToCheck.length === 0) {
    return `${packageDirectory} resolves outside local node_modules`;
  }

  for (const directory of directoriesToCheck) {
    const reason = await getUnsafeDirectoryReason(directory);

    if (reason) {
      return `${directory} is ${reason}`;
    }
  }

  return null;
}

/**
 * Validates that package file ancestors and the file itself are safe.
 */
export async function getUnsafePackageFileReason(
  packageDirectory: string,
  filePath: string
): Promise<string | null> {
  const directoriesToCheck = getDirectoriesBetween(
    packageDirectory,
    path.dirname(filePath)
  );

  if (directoriesToCheck.length === 0) {
    return `${filePath} resolves outside package`;
  }

  for (const directory of directoriesToCheck) {
    const reason = await getUnsafeDirectoryReason(directory);

    if (reason) {
      return `${directory} is ${reason}`;
    }
  }

  const reason = await getUnsafeFileReason(filePath);

  return reason ? `${filePath} is ${reason}` : null;
}

/**
 * Reports unsafe ownership or write permissions for a directory path.
 */
export async function getUnsafeDirectoryReason(
  directory: string
): Promise<string | null> {
  const stats = await stat(directory);

  if (!stats.isDirectory()) {
    return 'not a directory';
  }

  return getUnsafeStatsReason(stats);
}

/**
 * Reports unsafe ownership or write permissions for a file path.
 */
async function getUnsafeFileReason(filePath: string): Promise<string | null> {
  const stats = await stat(filePath);

  if (!stats.isFile()) {
    return 'not a file';
  }

  return getUnsafeStatsReason(stats);
}

/**
 * Reports unsafe ownership or write permissions from filesystem metadata.
 */
export function getUnsafeStatsReason(stats: {
  mode: number;
  uid: number;
}): string | null {
  const getuid = process.geteuid ?? process.getuid;

  if (typeof getuid !== 'function') {
    return null;
  }

  const uid = getuid();

  if ((stats.mode & 0o022) !== 0) {
    if ((stats.mode & 0o002) !== 0) {
      return 'world-writable';
    }

    return 'group-writable';
  }

  if (stats.uid !== uid) {
    return `owned by uid ${stats.uid}, current uid is ${uid}`;
  }

  return null;
}
