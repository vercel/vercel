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
  evaluateMarker,
  isWheelCompatible,
  normalizePackageName,
  parseUvLock,
  PythonAnalysisError,
  scanDistributions,
} from '@vercel/python-analysis';
import type { UvLockFile, UvLockPackage } from '@vercel/python-analysis';
import { getVenvSitePackagesDirs } from './install';
import { getUvBinaryForBundling, UV_BUNDLE_DIR } from './uv';
import { detectPlatform } from './utils';

const readFile = promisify(fs.readFile);

// AWS Lambda uncompressed size limit is 250MB, but we use 245MB to leave room for Lambda layers
export const LAMBDA_SIZE_THRESHOLD_BYTES = 245 * 1024 * 1024;

// AWS Lambda ephemeral storage (/tmp) is 512MB. Use 500MB to leave a buffer
// for runtime overhead (.pyc generation, uv cache, metadata, etc.)
export const LAMBDA_EPHEMERAL_STORAGE_BYTES = 500 * 1024 * 1024;

// Extended limit for Python on Hive (Functions Beta). All dependencies are
// bundled directly into the Lambda instead of using runtime installation.
export const HIVE_LAMBDA_SIZE_BYTES = 1 * 1024 * 1024 * 1024;

const FUNCTIONS_BETA_CTA =
  'Run `vercel deploy --functions-beta` to use extended function limits ' +
  '(up to 1 GB), or reduce your dependency footprint.';

/**
 * Returns true when the build environment opts in to showing the
 * `--functions-beta` suggestion in size-limit error messages.
 * Gated behind `VERCEL_FUNCTIONS_BETA_HINT` so it can be rolled out
 * independently of the feature itself.
 */
export function shouldShowFunctionsBetaHint(): boolean {
  const v = process.env.VERCEL_FUNCTIONS_BETA_HINT;
  return v === '1' || v === 'true';
}

interface PythonDependencyExternalizerOptions {
  venvPath: string;
  vendorDir: string;
  workPath: string;
  uvLockPath: string | null;
  uvProjectDir: string | null;
  projectName: string | undefined;
  pythonMajor: number | undefined;
  pythonMinor: number | undefined;
  pythonPath: string;
  hasCustomCommand: boolean;
  alwaysBundlePackages?: string[];
}

interface DependencyAnalysis {
  runtimeInstallEnabled: boolean;
  allVendorFiles: Files;
  totalBundleSize: number;
}

export class PythonDependencyExternalizer {
  private venvPath: string;
  private vendorDir: string;
  private workPath: string;
  private uvLockPath: string | null;
  private uvProjectDir: string | null;
  private projectName: string | undefined;
  private pythonMajor: number | undefined;
  private pythonMinor: number | undefined;
  private pythonPath: string;
  private hasCustomCommand: boolean;
  private alwaysBundlePackages: string[];

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
    this.pythonMajor = options.pythonMajor;
    this.pythonMinor = options.pythonMinor;
    this.pythonPath = options.pythonPath;
    this.hasCustomCommand = options.hasCustomCommand;
    this.alwaysBundlePackages = options.alwaysBundlePackages ?? [];
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
  async analyze(files: Files): Promise<DependencyAnalysis> {
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
        message: shouldShowFunctionsBetaHint()
          ? `Total bundle size (${totalBundleSizeMB} MB) exceeds the size limit (${limitMB} MB).\n\n` +
            FUNCTIONS_BETA_CTA
          : `Total bundle size (${totalBundleSizeMB} MB) exceeds the size limit (${limitMB} MB).\n\n` +
            `When using a custom install command, Vercel cannot automatically optimize ` +
            `dependency bundling. To reduce the size of your dependencies, you can:\n` +
            `  1. Remove unused dependencies from your project\n` +
            `  2. Remove the custom install command to allow Vercel to manage and optimize dependencies automatically`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
      });
    }

    // Enforce the extended 1 GB limit for Python on Hive (Functions Beta).
    // All dependencies are bundled directly, so check the total uncompressed
    // size before we proceed to avoid a slower failure at ZIP time.
    if (pythonOnHiveEnabled && this.totalBundleSize > HIVE_LAMBDA_SIZE_BYTES) {
      const limitMB = (HIVE_LAMBDA_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      throw new NowBuildError({
        code: 'LAMBDA_SIZE_EXCEEDED',
        message:
          `Total bundle size (${totalBundleSizeMB} MB) exceeds the extended function ` +
          `size limit (${limitMB} MB). Consider removing unused dependencies or ` +
          `splitting your application into smaller functions.`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
      });
    }

    return {
      runtimeInstallEnabled,
      allVendorFiles: this.allVendorFiles,
      totalBundleSize: this.totalBundleSize,
    };
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
        message: shouldShowFunctionsBetaHint()
          ? `Total bundle size (${totalBundleSizeMB} MB) exceeds the ephemeral storage limit (${ephemeralLimitMB} MB).\n\n` +
            FUNCTIONS_BETA_CTA
          : `Total bundle size (${totalBundleSizeMB} MB) exceeds Lambda ephemeral storage ` +
            `limit (${ephemeralLimitMB} MB). Even with runtime dependency installation, all ` +
            `packages must fit within the ${ephemeralLimitMB} MB ephemeral storage available ` +
            `to Lambda functions. Consider removing unused dependencies or splitting your ` +
            `application into smaller functions.`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
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

    // Check which public packages have compatible wheels for the Lambda platform.
    // Packages without a compatible wheel must be force-bundled because
    // `uv sync --no-build` at cold start will refuse to build from source.
    const forceBundledDueToWheels =
      await this.findPackagesWithoutCompatibleWheels(
        lockFile,
        classification.publicPackages
      );

    if (forceBundledDueToWheels.length > 0) {
      console.log(
        `Force-bundling ${forceBundledDueToWheels.length} package(s) without compatible wheels: ` +
          forceBundledDueToWheels.join(', ')
      );
    }

    // Remove force-bundled packages from the public set
    const forceBundledSet = new Set(
      forceBundledDueToWheels.map(normalizePackageName)
    );
    const externalizablePublic = classification.publicPackages.filter(
      name => !forceBundledSet.has(normalizePackageName(name))
    );

    if (externalizablePublic.length === 0) {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message:
          `Bundle size exceeds the Lambda limit and requires runtime dependency installation, ` +
          `but no public packages have compatible pre-built wheels for the Lambda platform.\n` +
          `Runtime dependency installation requires packages to have binary wheels.\n\n` +
          `To fix this, either:\n` +
          ` 1. Regenerate your lock file with: uv lock --upgrade, or\n` +
          ` 2. Switch the problematic packages to ones that have pre-built wheels available`,
      });
    }

    // Calculate per-package sizes for public packages
    const packageSizes = await calculatePerPackageSizes(this.venvPath);

    // Calculate fixed overhead: source files + private packages + vercel-runtime
    // + packages without compatible wheels.
    // These are always bundled and not part of the knapsack.
    // alwaysBundlePackages are included here so their files are copied into
    // the vendor directory and counted toward the fixed overhead.  They also
    // appear in bundledPackagesForConfig (below) so the runtime bootstrap
    // knows to skip reinstalling them.
    const alwaysBundled = [
      ...classification.privatePackages,
      'vercel-runtime',
      'vercel_runtime',
      ...this.alwaysBundlePackages,
      ...forceBundledDueToWheels,
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

    // _runtime_config.json will always be written.  We don't know the exact
    // content yet (it depends on bundledPackagesForConfig which is computed
    // after the knapsack), so use a conservative estimate.
    runtimeToolingOverhead += 4 * 1024; // 4 KB

    // Check if pyproject.toml and uv.lock will be bundled under _uv/
    const projectDirRel = relative(this.workPath, this.uvProjectDir);
    const uvLockRel = relative(this.workPath, this.uvLockPath);
    const isOutsideWorkPath =
      projectDirRel.startsWith('..') || uvLockRel.startsWith('..');

    if (isOutsideWorkPath) {
      const pyprojectPath = join(this.uvProjectDir, 'pyproject.toml');
      const pyprojectStats = await fs.promises
        .stat(pyprojectPath)
        .catch(() => null);
      const uvLockStats = await fs.promises
        .stat(this.uvLockPath)
        .catch(() => null);
      if (pyprojectStats) runtimeToolingOverhead += pyprojectStats.size;
      if (uvLockStats) runtimeToolingOverhead += uvLockStats.size;
    }

    // Dynamically derive the packing target: start from the hard Lambda size
    // threshold and subtract everything that is already committed to the bundle
    // (user source code, private packages, always-bundled packages, the uv
    // binary, and runtime config files). The remainder is the budget the
    // knapsack can fill with public packages.
    const remainingCapacity =
      LAMBDA_SIZE_THRESHOLD_BYTES - fixedOverhead - runtimeToolingOverhead;

    debug(
      `Fixed overhead: ${(fixedOverhead / (1024 * 1024)).toFixed(2)} MB, ` +
        `runtime tooling: ${(runtimeToolingOverhead / (1024 * 1024)).toFixed(2)} MB, ` +
        `remaining capacity for public packages: ${(remainingCapacity / (1024 * 1024)).toFixed(2)} MB`
    );

    // Build size map for externalizable public packages and run the knapsack algorithm
    const externalizableSet = new Set(
      externalizablePublic.map(normalizePackageName)
    );
    const publicPackageSizes = new Map(
      [...packageSizes].filter(([name]) =>
        externalizableSet.has(normalizePackageName(name))
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
    // alwaysBundlePackages appear here (in addition to alwaysBundled above)
    // so they are written to the runtime config and passed as
    // --no-install-package to `uv sync` at cold start.
    const bundledPackagesForConfig = [
      ...classification.privatePackages,
      ...bundledPublic,
      ...this.alwaysBundlePackages,
      ...forceBundledDueToWheels,
    ];

    // Write a runtime config marker so the bootstrap knows to run
    // `uv sync --inexact --frozen` at cold start. The pyproject.toml
    // and uv.lock are already part of the Lambda zip (globbed from
    // workPath). For workspace layouts where the project root lives
    // above workPath we bundle them explicitly under _uv/.
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

    // Final size verification – note that force-bundled wheel-incompatible packages
    // are included in the bundle, which can push total size over the threshold.
    // Allow 100 KB of tolerance for rounding and estimation discrepancies in the
    // knapsack capacity budget.  The actual AWS Lambda limit is 250 MB and we
    // target 245 MB, so a slight overshoot here is safe.
    const finalBundleSize = await calculateBundleSize(files);
    if (finalBundleSize > LAMBDA_SIZE_THRESHOLD_BYTES + 100 * 1024) {
      const finalSizeMB = (finalBundleSize / (1024 * 1024)).toFixed(2);
      const limitMB = (LAMBDA_SIZE_THRESHOLD_BYTES / (1024 * 1024)).toFixed(0);
      throw new NowBuildError({
        code: 'LAMBDA_SIZE_EXCEEDED',
        message: shouldShowFunctionsBetaHint()
          ? `Total bundle size (${finalSizeMB} MB) exceeds the size limit (${limitMB} MB).\n\n` +
            FUNCTIONS_BETA_CTA
          : `Total bundle size (${finalSizeMB} MB) exceeds Lambda limit (${limitMB} MB) even after ` +
            `deferring public packages to runtime installation. This usually means your ` +
            `private packages or source code are too large. Consider reducing the size of ` +
            `private dependencies or splitting your application.`,
        link: 'https://vercel.com/docs/functions/runtimes/python#controlling-what-gets-bundled',
        action: 'Learn More',
      });
    }
  }

  /**
   * Identify public packages that have no compatible wheel for the Lambda platform.
   * These packages must be force-bundled because `uv sync --no-build` at cold start
   * will refuse to build from source.
   *
   * Packages that are not reachable on the target platform (e.g. pywin32 which is
   * only a dependency when `sys_platform == 'win32'`) are excluded -- they will
   * never be installed by `uv sync` on Lambda, so their wheel compatibility is
   * irrelevant.
   */
  private async findPackagesWithoutCompatibleWheels(
    lockFile: UvLockFile,
    publicPackageNames: string[]
  ): Promise<string[]> {
    const platform = detectPlatform();

    // Skip wheel-compat filtering in dev; the bundle isn't deployed.
    if (this.pythonMajor === undefined || this.pythonMinor === undefined) {
      debug('Skipping wheel compatibility check: dev mode');
      return [];
    }

    // Determine which packages are actually reachable on the target platform
    // by traversing the dependency graph and evaluating environment markers.
    const reachable = await getPackagesReachableOnPlatform(
      lockFile,
      this.projectName,
      this.pythonMajor,
      this.pythonMinor,
      platform.sysPlatform,
      platform.archName
    );

    // Only check wheel compatibility for packages reachable on the target platform.
    const relevantPackages = reachable
      ? publicPackageNames.filter(name =>
          reachable.has(normalizePackageName(name))
        )
      : publicPackageNames;

    if (relevantPackages.length < publicPackageNames.length) {
      debug(
        `Skipping wheel check for ${publicPackageNames.length - relevantPackages.length} ` +
          `package(s) not reachable on the target platform`
      );
    }

    const publicSet = new Set(relevantPackages.map(normalizePackageName));

    // Build a map of normalized package name -> wheels from the lock file
    const packageWheels = new Map<string, Array<{ url: string }>>();
    for (const pkg of lockFile.packages) {
      const normalized = normalizePackageName(pkg.name);
      if (publicSet.has(normalized) && pkg.wheels.length > 0) {
        packageWheels.set(normalized, pkg.wheels);
      }
    }

    const incompatible: string[] = [];

    for (const name of relevantPackages) {
      const normalized = normalizePackageName(name);
      const wheels = packageWheels.get(normalized);

      if (!wheels || wheels.length === 0) {
        // No wheels listed in the lock file -- must be source-only
        incompatible.push(name);
        continue;
      }

      // Extract the filename from each wheel URL and check compatibility
      let hasCompatible = false;
      for (const wheel of wheels) {
        const filename = wheel.url.split('/').pop();
        if (!filename || !filename.endsWith('.whl')) continue;

        try {
          const compatible = await isWheelCompatible(
            filename,
            this.pythonMajor,
            this.pythonMinor,
            platform.osName,
            platform.archName,
            platform.osMajor,
            platform.osMinor
          );
          if (compatible) {
            hasCompatible = true;
            break;
          }
        } catch (err) {
          debug(
            `Failed to check wheel compatibility for ${filename}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      if (!hasCompatible) {
        incompatible.push(name);
      }
    }

    return incompatible;
  }
}

/**
 * Compute the set of packages reachable from the project root on the target
 * platform by traversing the dependency graph and evaluating environment
 * markers using uv's PEP 508 marker evaluator.
 *
 * Packages guarded by markers that exclude the target platform (e.g.
 * `sys_platform == 'win32'` when targeting Linux) are not traversed.
 *
 * Returns `null` if the project name is not provided (cannot determine root),
 * in which case callers should fall back to considering all packages.
 */
export async function getPackagesReachableOnPlatform(
  lockFile: UvLockFile,
  projectName: string | undefined,
  pythonMajor: number,
  pythonMinor: number,
  sysPlatform: string,
  platformMachine: string
): Promise<Set<string> | null> {
  if (!projectName) return null;

  const rootNormalized = normalizePackageName(projectName);

  // Build a map from normalized name to package entry
  const packageMap = new Map<string, UvLockPackage>();
  for (const pkg of lockFile.packages) {
    packageMap.set(normalizePackageName(pkg.name), pkg);
  }

  const rootPkg = packageMap.get(rootNormalized);
  if (!rootPkg) return null;

  const visited = new Set<string>();
  const queue: string[] = [];
  let queueHead = 0;

  // Seed the BFS with the root package's compatible dependencies
  async function enqueueDeps(pkg: UvLockPackage): Promise<void> {
    if (!pkg.dependencies) return;
    for (const dep of pkg.dependencies) {
      const normalized = normalizePackageName(dep.name);
      if (visited.has(normalized)) continue;
      if (dep.marker) {
        try {
          const compatible = await evaluateMarker(
            dep.marker,
            pythonMajor,
            pythonMinor,
            sysPlatform,
            platformMachine
          );
          if (!compatible) {
            debug(
              `Skipping dependency ${dep.name}: marker "${dep.marker}" not satisfied on ${sysPlatform}`
            );
            continue;
          }
        } catch (err) {
          // If we can't evaluate the marker, conservatively include the dependency
          debug(
            `Failed to evaluate marker "${dep.marker}" for ${dep.name}, including conservatively: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
      queue.push(normalized);
    }
  }

  await enqueueDeps(rootPkg);

  while (queueHead < queue.length) {
    const current = queue[queueHead++];
    if (visited.has(current)) continue;
    visited.add(current);

    const pkg = packageMap.get(current);
    if (pkg) {
      await enqueueDeps(pkg);
    }
  }

  return visited;
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
