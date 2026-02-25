import fs from 'fs';
import { promisify } from 'util';
import { join, relative, resolve, sep } from 'path';
import {
  FileBlob,
  FileFsRef,
  Files,
  NowBuildError,
  debug,
} from '@vercel/build-utils';
import {
  classifyPackages,
  normalizePackageName,
  parseUvLock,
  PythonAnalysisError,
  scanDistributions,
} from '@vercel/python-analysis';
import { getVenvSitePackagesDirs } from './install';
import { getUvBinaryForBundling, UV_BUNDLE_DIR } from './uv';

const readFile = promisify(fs.readFile);

// AWS Lambda uncompressed size limit is 250MB, but we use 249MB to leave a small buffer
export const LAMBDA_SIZE_THRESHOLD_BYTES = 249 * 1024 * 1024;
// Pack Lambda up to 245MB to leave a buffer
export const LAMBDA_PACKING_TARGET_BYTES = 245 * 1024 * 1024;

// AWS Lambda ephemeral storage (/tmp) is 512MB. Use 500MB to leave a buffer
// for runtime overhead (.pyc generation, uv cache, metadata, etc.)
export const LAMBDA_EPHEMERAL_STORAGE_BYTES = 500 * 1024 * 1024;

interface PythonDependencyExternalizerOptions {
  venvPath: string;
  vendorDir: string;
  workPath: string;
  uvLockPath: string | null;
  uvProjectDir: string | null;
  projectName: string | undefined;
  noBuildCheckFailed: boolean;
  pythonPath: string;
  hasCustomCommand: boolean;
}

export class PythonDependencyExternalizer {
  private venvPath: string;
  private vendorDir: string;
  private workPath: string;
  private uvLockPath: string | null;
  private uvProjectDir: string | null;
  private projectName: string | undefined;
  private noBuildCheckFailed: boolean;
  private pythonPath: string;
  private hasCustomCommand: boolean;

  // Populated by analyze()
  private allVendorFiles: Files = {};
  private totalBundleSize: number = 0;
  private analyzed = false;

  constructor(options: PythonDependencyExternalizerOptions) {
    this.venvPath = options.venvPath;
    this.vendorDir = options.vendorDir;
    this.workPath = options.workPath;
    this.uvLockPath = options.uvLockPath;
    this.uvProjectDir = options.uvProjectDir;
    this.projectName = options.projectName;
    this.noBuildCheckFailed = options.noBuildCheckFailed;
    this.pythonPath = options.pythonPath;
    this.hasCustomCommand = options.hasCustomCommand;
  }

  shouldEnableRuntimeInstall(): boolean {
    if (this.hasCustomCommand) {
      return false;
    }
    const pythonOnHiveEnabled =
      process.env.VERCEL_PYTHON_ON_HIVE === '1' ||
      process.env.VERCEL_PYTHON_ON_HIVE === 'true';
    if (pythonOnHiveEnabled) {
      return false;
    } else if (
      this.totalBundleSize > LAMBDA_SIZE_THRESHOLD_BYTES &&
      this.uvLockPath !== null
    ) {
      return true;
    }
    return false;
  }

  /**
   * Analyze the bundle: mirror all vendor files, calculate total size,
   * and determine whether runtime installation is needed.
   * Must be called before generateBundle().
   */
  async analyze(files: Files): Promise<{
    runtimeInstallEnabled: boolean;
    allVendorFiles: Files;
  }> {
    this.allVendorFiles = await mirrorPackagesIntoVendor({
      venvPath: this.venvPath,
      vendorDirName: this.vendorDir,
    });

    const tempFilesForSizing: Files = { ...files };
    for (const [p, f] of Object.entries(this.allVendorFiles)) {
      tempFilesForSizing[p] = f;
    }
    this.totalBundleSize = await calculateBundleSize(tempFilesForSizing);
    this.analyzed = true;

    const totalBundleSizeMB = (this.totalBundleSize / (1024 * 1024)).toFixed(2);
    debug(`Total bundle size: ${totalBundleSizeMB} MB`);

    const runtimeInstallEnabled = this.shouldEnableRuntimeInstall();

    const pythonOnHiveEnabled =
      process.env.VERCEL_PYTHON_ON_HIVE === '1' ||
      process.env.VERCEL_PYTHON_ON_HIVE === 'true';

    if (
      this.totalBundleSize > LAMBDA_SIZE_THRESHOLD_BYTES &&
      this.hasCustomCommand &&
      !pythonOnHiveEnabled
    ) {
      const limitMB = (LAMBDA_SIZE_THRESHOLD_BYTES / (1024 * 1024)).toFixed(0);
      throw new NowBuildError({
        code: 'LAMBDA_SIZE_EXCEEDED',
        message:
          `Total bundle size (${totalBundleSizeMB} MB) exceeds the Lambda size limit (${limitMB} MB).\n\n` +
          `Runtime dependency installation is not available for projects that use a custom ` +
          `build or install command, because custom commands may install dependencies that ` +
          `are not tracked in uv.lock.\n\n` +
          `To resolve this, either:\n` +
          `  1. Remove the custom build/install command and let Vercel manage dependencies automatically\n` +
          `  2. Reduce your dependency footprint to fit within the ${limitMB} MB limit`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
      });
    }

    return { runtimeInstallEnabled, allVendorFiles: this.allVendorFiles };
  }

  /**
   * Generate the optimally-packed Lambda bundle.
   * Mutates `files` in place: adds vendor files (private + knapsack-selected
   * public), runtime config, and uv binary.
   * Must be called after analyze().
   */
  async generateBundle(files: Files): Promise<void> {
    if (!this.analyzed) {
      throw new Error(
        'PythonDependencyExternalizer.analyze() must be called before generateBundle()'
      );
    }
    if (!this.uvLockPath || !this.uvProjectDir) {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message:
          'Runtime dependency installation requires a uv.lock file and project directory.',
      });
    }

    const totalBundleSizeMB = (this.totalBundleSize / (1024 * 1024)).toFixed(2);

    console.log(
      `Bundle size (${totalBundleSizeMB} MB) exceeds limit. ` +
        `Enabling runtime dependency installation.`
    );

    // Verify total deps won't exceed Lambda ephemeral storage (512 MB)
    if (this.totalBundleSize > LAMBDA_EPHEMERAL_STORAGE_BYTES) {
      const ephemeralLimitMB = (
        LAMBDA_EPHEMERAL_STORAGE_BYTES /
        (1024 * 1024)
      ).toFixed(0);
      throw new NowBuildError({
        code: 'LAMBDA_SIZE_EXCEEDED',
        message:
          `Total dependency size (${totalBundleSizeMB} MB) exceeds Lambda ephemeral storage ` +
          `limit (${ephemeralLimitMB} MB). Even with runtime dependency installation, all ` +
          `packages must fit within the ${ephemeralLimitMB} MB ephemeral storage available ` +
          `to Lambda functions. Consider removing unused dependencies or splitting your ` +
          `application into smaller functions.`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
      });
    }

    // If the earlier --no-build check failed, we know some packages don't have pre-built wheels.
    if (this.noBuildCheckFailed) {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message:
          `Bundle size exceeds the Lambda limit and requires runtime dependency installation, ` +
          `but some packages in your uv.lock file do not have pre-built binary wheels available.\n` +
          `Runtime dependency installation requires all public packages to have binary wheels.\n\n` +
          `To fix this, either:\n` +
          ` 1. Regenerate your lock file with: uv lock --upgrade --no-build, or\n` +
          ` 2. Switch the problematic packages to ones that have pre-built wheels available`,
      });
    }

    // Read and parse the uv.lock file
    let lockContent: string;
    try {
      lockContent = await readFile(this.uvLockPath, 'utf8');
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.log(
          `Failed to read uv.lock file at "${this.uvLockPath}": ${error.message}`
        );
      } else {
        console.log(
          `Failed to read uv.lock file at "${this.uvLockPath}": ${String(error)}`
        );
      }
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message: `Failed to read uv.lock file at "${this.uvLockPath}"`,
      });
    }
    let lockFile: ReturnType<typeof parseUvLock>;
    try {
      lockFile = parseUvLock(lockContent, this.uvLockPath);
    } catch (error: unknown) {
      if (error instanceof PythonAnalysisError) {
        if (error.fileContent) {
          console.log(
            `Failed to parse "${error.path}". File content:\n${error.fileContent}`
          );
        }
        throw new NowBuildError({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    // Exclude the project name from runtime installation requirements.
    const excludePackages: string[] = [];
    if (this.projectName) {
      excludePackages.push(this.projectName);
      debug(
        `Excluding project package "${this.projectName}" from runtime installation`
      );
    }

    const classification = classifyPackages({
      lockFile,
      excludePackages,
    });
    debug(
      `Package classification: ${classification.privatePackages.length} private, ` +
        `${classification.publicPackages.length} public`
    );

    if (classification.publicPackages.length === 0) {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message:
          'Bundle size exceeds limit but no public packages found for runtime installation.',
      });
    }

    // Calculate per-package sizes for public packages
    const packageSizes = await calculatePerPackageSizes(this.venvPath);

    // Calculate fixed overhead: source files + private packages + vercel-runtime.
    // These are always bundled and not part of the knapsack.
    const alwaysBundled = [
      ...classification.privatePackages,
      'vercel-runtime',
      'vercel_runtime',
    ];
    const alwaysBundledFiles = await mirrorPackagesIntoVendor({
      venvPath: this.venvPath,
      vendorDirName: this.vendorDir,
      includePackages: alwaysBundled,
    });

    const baseFiles: Files = { ...files };
    for (const [p, f] of Object.entries(alwaysBundledFiles)) {
      baseFiles[p] = f;
    }
    const fixedOverhead = await calculateBundleSize(baseFiles);

    // Account for the uv binary that will be added to the bundle.
    // This must be subtracted from capacity before running the knapsack
    // so we don't over-pack and exceed the Lambda size limit.
    let runtimeToolingOverhead = 0;
    if (process.env.VERCEL_BUILD_IMAGE) {
      try {
        const uvBinaryPath = await getUvBinaryForBundling(this.pythonPath);
        const uvStats = await fs.promises.stat(uvBinaryPath);
        runtimeToolingOverhead = uvStats.size;
      } catch {
        // If we can't stat the binary, use a conservative estimate
        runtimeToolingOverhead = 50 * 1024 * 1024; // 50 MB
      }
    }

    const remainingCapacity =
      LAMBDA_PACKING_TARGET_BYTES - fixedOverhead - runtimeToolingOverhead;

    debug(
      `Fixed overhead: ${(fixedOverhead / (1024 * 1024)).toFixed(2)} MB, ` +
        `runtime tooling: ${(runtimeToolingOverhead / (1024 * 1024)).toFixed(2)} MB, ` +
        `remaining capacity for public packages: ${(remainingCapacity / (1024 * 1024)).toFixed(2)} MB`
    );

    // Build size map for public packages and run the knapsack algorithm
    const publicPackageSizes = new Map(
      [...packageSizes].filter(([name]) =>
        classification.publicPackages.includes(name)
      )
    );

    const bundledPublic = lambdaKnapsack(publicPackageSizes, remainingCapacity);

    // Mirror the selected packages (always-bundled + knapsack-selected public)
    const allBundledPackages = [...alwaysBundled, ...bundledPublic];
    const selectedVendorFiles = await mirrorPackagesIntoVendor({
      venvPath: this.venvPath,
      vendorDirName: this.vendorDir,
      includePackages: allBundledPackages,
    });

    for (const [p, f] of Object.entries(selectedVendorFiles)) {
      files[p] = f;
    }

    // The bundledPackages list for runtime config includes private packages
    // and any public packages we selected for bundling. These will be
    // passed as --no-install-package to uv sync at runtime.
    const bundledPackagesForConfig = [
      ...classification.privatePackages,
      ...bundledPublic,
    ];

    // Write a runtime config marker so the bootstrap knows to run
    // `uv sync --inexact --frozen` at cold start. The pyproject.toml
    // and uv.lock are already part of the Lambda zip (globbed from
    // workPath). For workspace layouts where the project root lives
    // above workPath we bundle them explicitly under _uv/.
    const projectDirRel = relative(this.workPath, this.uvProjectDir);
    const uvLockRel = relative(this.workPath, this.uvLockPath);
    const isOutsideWorkPath =
      projectDirRel.startsWith('..') || uvLockRel.startsWith('..');

    if (isOutsideWorkPath) {
      // Bundle pyproject.toml and uv.lock into _uv/ so they are
      // available inside the Lambda even for workspace monorepos.
      const srcPyproject = join(this.uvProjectDir, 'pyproject.toml');
      files[`${UV_BUNDLE_DIR}/pyproject.toml`] = new FileFsRef({
        fsPath: srcPyproject,
      });
      files[`${UV_BUNDLE_DIR}/uv.lock`] = new FileFsRef({
        fsPath: this.uvLockPath,
      });
    }

    const runtimeConfigData = JSON.stringify({
      projectDir: isOutsideWorkPath ? UV_BUNDLE_DIR : projectDirRel,
      bundledPackages: bundledPackagesForConfig,
    });
    files[`${UV_BUNDLE_DIR}/_runtime_config.json`] = new FileBlob({
      data: runtimeConfigData,
    });

    // Skip uv bundling when running vercel build locally
    if (process.env.VERCEL_BUILD_IMAGE) {
      // Add the uv binary to the lambda zip
      try {
        const uvBinaryPath = await getUvBinaryForBundling(this.pythonPath);

        const uvBundleDir = join(this.workPath, UV_BUNDLE_DIR);
        const uvLocalPath = join(uvBundleDir, 'uv');
        await fs.promises.mkdir(uvBundleDir, { recursive: true });
        await fs.promises.copyFile(uvBinaryPath, uvLocalPath);
        await fs.promises.chmod(uvLocalPath, 0o755);

        const uvBundlePath = `${UV_BUNDLE_DIR}/uv`;
        files[uvBundlePath] = new FileFsRef({
          fsPath: uvLocalPath,
          mode: 0o100755, // Regular file + executable
        });
        debug(`Bundled uv binary from ${uvBinaryPath} to ${uvLocalPath}`);
      } catch (err) {
        throw new NowBuildError({
          code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
          message: `Failed to bundle uv binary for runtime installation: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }

    // Final size verification
    const finalBundleSize = await calculateBundleSize(files);
    if (finalBundleSize > LAMBDA_SIZE_THRESHOLD_BYTES) {
      const finalSizeMB = (finalBundleSize / (1024 * 1024)).toFixed(2);
      const limitMB = (LAMBDA_SIZE_THRESHOLD_BYTES / (1024 * 1024)).toFixed(0);
      throw new NowBuildError({
        code: 'LAMBDA_SIZE_EXCEEDED',
        message:
          `Bundle size (${finalSizeMB} MB) exceeds Lambda limit (${limitMB} MB) even after ` +
          `deferring public packages to runtime installation. This usually means your ` +
          `private packages or source code are too large. Consider reducing the size of ` +
          `private dependencies or splitting your application.`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
      });
    }
  }
}

// Utility functions
/**
 * Mirror packages from site-packages into the _vendor directory.
 *
 * When `includePackages` is provided, only distributions whose normalized
 * name is in the list are included.  When omitted, every distribution is
 * included.
 */
export async function mirrorPackagesIntoVendor({
  venvPath,
  vendorDirName,
  includePackages,
}: {
  venvPath: string;
  vendorDirName: string;
  includePackages?: string[];
}): Promise<Files> {
  const vendorFiles: Files = {};

  if (includePackages && includePackages.length === 0) {
    return vendorFiles;
  }

  const includeSet = includePackages
    ? new Set(includePackages.map(normalizePackageName))
    : null;

  const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);
  for (const dir of sitePackageDirs) {
    if (!fs.existsSync(dir)) continue;

    const resolvedDir = resolve(dir);
    const dirPrefix = resolvedDir + sep;
    const distributions = await scanDistributions(dir);

    for (const [name, dist] of distributions) {
      if (includeSet && !includeSet.has(name)) continue;

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
        // Skip files listed in RECORD but missing on disk (e.g. deleted by a custom install command)
        if (!fs.existsSync(srcFsPath)) {
          continue;
        }
        const bundlePath = join(vendorDirName, filePath).replace(/\\/g, '/');
        vendorFiles[bundlePath] = new FileFsRef({ fsPath: srcFsPath });
      }
    }
  }

  debug(
    `Mirrored ${Object.keys(vendorFiles).length} files` +
      (includePackages ? ` from ${includePackages.length} packages` : '')
  );
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
 * Largest-first knapsack packing algorithm.
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
    return [];
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
async function calculatePerPackageSizes(
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
