import fs from 'fs';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { FileFsRef, Files, debug } from '@vercel/build-utils';
import {
  normalizePackageName,
  scanDistributions,
} from '@vercel/python-analysis';
import type { DistributionIndex, PackagePath } from '@vercel/python-analysis';
import {
  derivePrefixPycBundlePath,
  derivePycPath,
  deriveStagedPycFsPath,
  type BytecodeCollectionResult,
} from './compileall';
import { getVenvSitePackagesDirs } from './install';

const STRIP_BASENAMES = new Set([
  'py.typed',
  'WHEEL',
  'INSTALLER',
  'direct_url.json',
]);

function shouldStripVendorFile(filePath: string): boolean {
  const segments = filePath.split(sep);
  if (segments.includes('__pycache__')) return true;
  const name = segments[segments.length - 1] ?? '';
  if (name.endsWith('.pyc') || name.endsWith('.pyi')) return true;
  if (STRIP_BASENAMES.has(name)) return true;
  return false;
}

export interface DistributionFileEntry {
  absolutePath: string;
  relativePath: string;
  record: PackagePath;
}

export interface DistributionFileGroup {
  packageName: string;
  sitePackagesDir: string;
  files: DistributionFileEntry[];
}

export function getDistributionFileGroups({
  sitePackageDirs,
  distributions,
  includePackages,
}: {
  sitePackageDirs: string[];
  distributions: ReadonlyMap<string, DistributionIndex>;
  includePackages?: string[];
}): DistributionFileGroup[] {
  if (includePackages?.length === 0) {
    return [];
  }

  const includeSet = includePackages
    ? new Set(includePackages.map(normalizePackageName))
    : null;
  const groups: DistributionFileGroup[] = [];

  for (const dir of sitePackageDirs) {
    const dirDistributions = distributions.get(dir);
    if (!dirDistributions) continue;

    const sitePackagesDir = resolve(dir);

    for (const [name, distribution] of dirDistributions) {
      const packageName = normalizePackageName(name);
      if (includeSet && !includeSet.has(packageName)) continue;

      const files: DistributionFileEntry[] = [];
      for (const record of distribution.files) {
        const absolutePath = resolve(
          sitePackagesDir,
          record.path.replaceAll('/', sep)
        );
        const relativePath = relative(sitePackagesDir, absolutePath);
        if (
          relativePath === '' ||
          relativePath === '..' ||
          relativePath.startsWith(`..${sep}`) ||
          isAbsolute(relativePath)
        ) {
          continue;
        }

        files.push({ absolutePath, relativePath, record });
      }

      groups.push({ packageName, sitePackagesDir, files });
    }
  }

  return groups;
}

interface InstalledPythonDistributionsOptions {
  sitePackageDirs: string[];
  distributions: ReadonlyMap<string, DistributionIndex>;
  pythonMajor: number | undefined;
  pythonMinor: number | undefined;
}

export class InstalledPythonDistributions {
  private readonly sitePackageDirs: string[];
  private readonly distributions: ReadonlyMap<string, DistributionIndex>;
  private readonly pythonMajor: number | undefined;
  private readonly pythonMinor: number | undefined;

  static async load({
    venvPath,
    pythonMajor,
    pythonMinor,
  }: {
    venvPath: string;
    pythonMajor: number | undefined;
    pythonMinor: number | undefined;
  }): Promise<InstalledPythonDistributions> {
    const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);
    const distributions = new Map<string, DistributionIndex>();

    for (const dir of sitePackageDirs) {
      try {
        await fs.promises.access(dir);
      } catch {
        continue;
      }
      distributions.set(dir, await scanDistributions(dir));
    }

    return new InstalledPythonDistributions({
      sitePackageDirs,
      distributions,
      pythonMajor,
      pythonMinor,
    });
  }

  constructor(options: InstalledPythonDistributionsOptions) {
    this.sitePackageDirs = options.sitePackageDirs;
    this.distributions = options.distributions;
    this.pythonMajor = options.pythonMajor;
    this.pythonMinor = options.pythonMinor;
  }

  async mirrorPackagesIntoVendor({
    vendorDirName,
    includePackages,
  }: {
    vendorDirName: string;
    includePackages?: string[];
  }): Promise<Files> {
    interface PendingEntry {
      bundlePath: string;
      srcFsPath: string;
      recordSize: number | undefined;
    }

    const pending: PendingEntry[] = [];
    const distributionGroups = getDistributionFileGroups({
      sitePackageDirs: this.sitePackageDirs,
      distributions: this.distributions,
      includePackages,
    });

    for (const { files } of distributionGroups) {
      for (const { absolutePath, relativePath, record } of files) {
        if (shouldStripVendorFile(relativePath)) continue;

        pending.push({
          bundlePath: join(vendorDirName, relativePath).replace(/\\/g, '/'),
          srcFsPath: absolutePath,
          recordSize: record.size != null ? Number(record.size) : undefined,
        });
      }
    }

    const results = await Promise.all(
      pending.map(async ({ bundlePath, srcFsPath, recordSize }) => {
        try {
          if (recordSize === undefined) {
            const stats = await fs.promises.stat(srcFsPath);
            return { bundlePath, srcFsPath, size: stats.size };
          }
          await fs.promises.access(srcFsPath);
          return { bundlePath, srcFsPath, size: recordSize };
        } catch {
          return null;
        }
      })
    );

    const vendorFiles: Files = {};
    for (const result of results) {
      if (!result) continue;
      vendorFiles[result.bundlePath] = new FileFsRef({
        fsPath: result.srcFsPath,
        size: result.size,
      });
    }

    debug(
      `Mirrored ${Object.keys(vendorFiles).length} files` +
        (includePackages ? ` from ${includePackages.length} packages` : '')
    );
    return vendorFiles;
  }

  async calculatePerPackageSizes(): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    const distributionGroups = getDistributionFileGroups({
      sitePackageDirs: this.sitePackageDirs,
      distributions: this.distributions,
    });

    for (const { packageName, files } of distributionGroups) {
      let knownSize = 0;
      const statPromises: Promise<number>[] = [];

      for (const { absolutePath, relativePath, record } of files) {
        if (shouldStripVendorFile(relativePath)) continue;

        if (record.size != null) {
          knownSize += Number(record.size);
        } else {
          statPromises.push(
            fs.promises
              .stat(absolutePath)
              .then(stats => stats.size)
              .catch(() => 0)
          );
        }
      }

      const statSizes = await Promise.all(statPromises);
      sizes.set(
        packageName,
        statSizes.reduce((total, size) => total + size, knownSize)
      );
    }

    return sizes;
  }

  async collectBytecodeFiles({
    vendorDirName,
    includePackages,
  }: {
    vendorDirName: string;
    includePackages?: string[];
  }): Promise<BytecodeCollectionResult> {
    if (this.pythonMajor == null || this.pythonMinor == null) {
      return { files: {}, totalSize: 0, perItemSizes: new Map() };
    }

    interface PendingEntry {
      bundlePath: string;
      srcFsPath: string;
      packageName: string;
    }

    const pending: PendingEntry[] = [];
    const distributionGroups = getDistributionFileGroups({
      sitePackageDirs: this.sitePackageDirs,
      distributions: this.distributions,
      includePackages,
    });

    for (const { packageName, sitePackagesDir, files } of distributionGroups) {
      for (const { relativePath } of files) {
        const pycRelativePath = derivePycPath(
          relativePath.replaceAll(sep, '/'),
          this.pythonMajor,
          this.pythonMinor
        );
        if (!pycRelativePath) continue;

        const pycFilePath = pycRelativePath.replaceAll('/', sep);
        pending.push({
          bundlePath: join(vendorDirName, pycFilePath).replace(/\\/g, '/'),
          srcFsPath: join(sitePackagesDir, pycFilePath),
          packageName,
        });
      }
    }

    const result = await this.collectExistingBytecode(pending);
    debug(
      `Collected ${Object.keys(result.files).length} bytecode files` +
        ` (${(result.totalSize / (1024 * 1024)).toFixed(2)} MB)` +
        (includePackages ? ` from ${includePackages.length} packages` : '')
    );
    return result;
  }

  async collectPrefixBytecodeFiles({
    stagingDir,
    runtimeRoot,
    includePackages,
  }: {
    stagingDir: string;
    runtimeRoot: string;
    includePackages?: string[];
  }): Promise<BytecodeCollectionResult> {
    if (this.pythonMajor == null || this.pythonMinor == null) {
      return { files: {}, totalSize: 0, perItemSizes: new Map() };
    }

    interface PendingEntry {
      bundlePath: string;
      srcFsPath: string;
      packageName: string;
    }

    const pending: PendingEntry[] = [];
    const distributionGroups = getDistributionFileGroups({
      sitePackageDirs: this.sitePackageDirs,
      distributions: this.distributions,
      includePackages,
    });

    for (const { packageName, files } of distributionGroups) {
      for (const { absolutePath, relativePath } of files) {
        if (!relativePath.endsWith('.py')) continue;

        const recordPath = relativePath.replaceAll(sep, '/');
        const srcFsPath = deriveStagedPycFsPath(
          stagingDir,
          absolutePath,
          this.pythonMajor,
          this.pythonMinor
        );
        const bundlePath = derivePrefixPycBundlePath(
          `${runtimeRoot}/${recordPath}`,
          this.pythonMajor,
          this.pythonMinor
        );
        if (!srcFsPath || !bundlePath) continue;

        pending.push({ bundlePath, srcFsPath, packageName });
      }
    }

    const result = await this.collectExistingBytecode(pending);
    debug(
      `Collected ${Object.keys(result.files).length} prefix bytecode files` +
        ` (${(result.totalSize / (1024 * 1024)).toFixed(2)} MB)` +
        ` for runtime root ${runtimeRoot}` +
        (includePackages ? ` from ${includePackages.length} packages` : '')
    );
    return result;
  }

  private async collectExistingBytecode(
    pending: {
      bundlePath: string;
      srcFsPath: string;
      packageName: string;
    }[]
  ): Promise<BytecodeCollectionResult> {
    const results = await Promise.all(
      pending.map(async ({ bundlePath, srcFsPath, packageName }) => {
        try {
          const stats = await fs.promises.stat(srcFsPath);
          return { bundlePath, srcFsPath, size: stats.size, packageName };
        } catch {
          return null;
        }
      })
    );

    const files: Files = {};
    let totalSize = 0;
    const perItemSizes = new Map<string, number>();

    for (const result of results) {
      if (!result) continue;
      files[result.bundlePath] = new FileFsRef({
        fsPath: result.srcFsPath,
        size: result.size,
      });
      totalSize += result.size;
      perItemSizes.set(
        result.packageName,
        (perItemSizes.get(result.packageName) ?? 0) + result.size
      );
    }

    return { files, totalSize, perItemSizes };
  }
}
