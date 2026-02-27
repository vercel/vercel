import fs from 'fs';
import { isAbsolute, join, relative } from 'path';
import execa from 'execa';
import { NowBuildError, debug } from '@vercel/build-utils';
import { extendDistRecord } from '@vercel/python-analysis';
import { getVenvPythonBin } from '../utils';
import { getVenvSitePackagesDirs, resolveVendorDir } from '../install';
import type { Quirk, QuirkContext, QuirkResult } from './index';

function execErrorMessage(err: unknown): string {
  if (err != null && typeof err === 'object' && 'stderr' in err) {
    const stderr = String((err as Record<string, unknown>).stderr);
    if (stderr) return stderr;
  }
  return err instanceof Error ? err.message : String(err);
}

const DUMMY_SCHEMA_NAME = '_prisma_dummy.prisma';
const LAMBDA_ROOT = '/var/task';

// The OpenSSL version that prisma-client-py's binary_platform() reports on
// Amazon Linux.  Used to derive both the engine binary filename and the
// openssl shim output — keep these in sync.
export const RUNTIME_OPENSSL_VERSION = '3.2';

function getLambdaBinaryTarget(): string {
  return process.arch === 'arm64'
    ? 'linux-arm64-openssl-3.0.x'
    : 'rhel-openssl-3.0.x';
}

function buildDummySchema(generatedDir: string): string {
  const lambdaTarget = getLambdaBinaryTarget();
  return `\
datasource db {
  provider = "sqlite"
  url      = "file:dev.db"
}

generator client {
  provider      = "prisma-client-py"
  binaryTargets = ["native", "${lambdaTarget}"]
  output        = "${generatedDir}"
}

model DummyModel {
  id Int @id
}
`;
}

/**
 * Find the user's Prisma schema.
 *
 * Checks `PRISMA_SCHEMA_PATH` env var first, then falls back to common
 * locations: `schema.prisma` and `prisma/schema.prisma` in the project root.
 */
async function findUserSchema(workPath: string): Promise<string | null> {
  const envPath = process.env.PRISMA_SCHEMA_PATH;
  if (envPath) {
    const resolved = isAbsolute(envPath) ? envPath : join(workPath, envPath);
    try {
      await fs.promises.access(resolved);
      return resolved;
    } catch {
      debug(`PRISMA_SCHEMA_PATH=${envPath} not found at ${resolved}`);
      return null;
    }
  }

  const candidates = [
    join(workPath, 'schema.prisma'),
    join(workPath, 'prisma', 'schema.prisma'),
  ];
  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/** Recursively collect file paths under `dir`, relative to `base`. */
async function collectFiles(dir: string, base: string): Promise<string[]> {
  const result: string[] = [];
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(full, base)));
    } else {
      result.push(relative(base, full));
    }
  }
  return result;
}

/** Remove transient files prisma leaves inside cacheDir. */
async function cleanCacheArtifacts(cacheDir: string, extras: string[] = []) {
  const paths = [
    join(cacheDir, 'node_modules'),
    join(cacheDir, 'package.json'),
    join(cacheDir, 'package-lock.json'),
    ...extras,
  ];
  for (const p of paths) {
    try {
      await fs.promises.rm(p, { recursive: true, force: true });
    } catch (err) {
      console.warn(
        `could not clean up ${p}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/** Check whether the prisma client has already been generated. */
async function isClientGenerated(
  pythonPath: string,
  env: NodeJS.ProcessEnv
): Promise<boolean> {
  try {
    await execa(pythonPath, ['-c', 'import prisma.client'], {
      env,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export const prismaQuirk: Quirk = {
  dependency: 'prisma',
  async run(ctx: QuirkContext): Promise<QuirkResult> {
    const { venvPath, pythonEnv, workPath } = ctx;
    const pythonPath = getVenvPythonBin(venvPath);

    // The runtime cache dir is where the engine binary and openssl shim
    // will live inside the Lambda bundle.  Derived from resolveVendorDir()
    // so it stays in sync with the vendor directory used by the builder.
    const runtimeCacheDir = join(
      LAMBDA_ROOT,
      resolveVendorDir(),
      'prisma',
      '__bincache__'
    );

    // 1. Find the site-packages directory that actually contains prisma.
    //    getVenvSitePackagesDirs() can return multiple dirs (e.g. virtualenv
    //    with system site-packages); we must operate on the one where prisma
    //    is installed so that cache paths and RECORD patching target the
    //    correct location.
    const sitePackagesDirs = await getVenvSitePackagesDirs(venvPath);
    let sitePackages: string | undefined;
    for (const dir of sitePackagesDirs) {
      try {
        await fs.promises.access(join(dir, 'prisma'));
        sitePackages = dir;
        break;
      } catch {
        // not in this dir
      }
    }
    if (!sitePackages) {
      console.warn(
        'prisma: could not find prisma in any site-packages directory'
      );
      return {};
    }

    // 2. Create cache directory inside prisma package
    const cacheDir = join(sitePackages, 'prisma', '__bincache__');
    await fs.promises.mkdir(cacheDir, { recursive: true });

    const generateEnv = {
      ...pythonEnv,
      PRISMA_BINARY_CACHE_DIR: cacheDir,
    };

    // 3. Write dummy schema to force downloading engine binaries for
    //    the Lambda target platforms via binaryTargets.
    //    Generated output goes to workPath (NOT inside site-packages/prisma/)
    //    to avoid copytree recursion when the generator copies the prisma package.
    const generatedDir = join(workPath, '_prisma_generated');
    const dummySchemaPath = join(workPath, DUMMY_SCHEMA_NAME);
    await fs.promises.writeFile(
      dummySchemaPath,
      buildDummySchema(generatedDir)
    );

    // 4. Run `python -m prisma generate --schema=<dummy>` with
    //    PRISMA_BINARY_CACHE_DIR set so engines land in cacheDir.
    debug(`Running prisma generate (dummy) with cache dir: ${cacheDir}`);
    try {
      const dummyResult = await execa(
        pythonPath,
        ['-m', 'prisma', 'generate', `--schema=${dummySchemaPath}`],
        {
          cwd: workPath,
          env: generateEnv,
          stdio: 'pipe',
        }
      );
      if (dummyResult.stdout)
        debug(`prisma generate (dummy) stdout: ${dummyResult.stdout}`);
      if (dummyResult.stderr)
        debug(`prisma generate (dummy) stderr: ${dummyResult.stderr}`);
    } catch (err: unknown) {
      throw new NowBuildError({
        code: 'PRISMA_GENERATE_FAILED',
        message:
          `Prisma engine download failed during \`prisma generate\`. ` +
          `Check that your prisma version is compatible with this Python version.\n` +
          execErrorMessage(err),
      });
    }

    // 5. Pick the engine binary for the build architecture and rename it to
    //    the name prisma-client-py's query_engine_name() expects at runtime.
    //    On Amazon Linux, binary_platform() returns "rhel-openssl-{version}"
    //    regardless of CPU architecture, so the runtime name is always
    //    "prisma-query-engine-rhel-openssl-{RUNTIME_OPENSSL_VERSION}.x".
    const srcBinaryPrefix = `query-engine-${getLambdaBinaryTarget()}`;
    const runtimeName = `prisma-query-engine-rhel-openssl-${RUNTIME_OPENSSL_VERSION}.x`;
    const nodeModulesDir = join(cacheDir, 'node_modules', 'prisma');
    let engineCopied = false;
    try {
      const entries = await fs.promises.readdir(nodeModulesDir);
      for (const entry of entries) {
        if (!entry.startsWith(srcBinaryPrefix)) continue;
        const srcPath = join(nodeModulesDir, entry);
        const destPath = join(cacheDir, runtimeName);
        try {
          await fs.promises.access(destPath);
          debug(`Engine binary: ${runtimeName} already exists, skipping`);
        } catch {
          debug(`Engine binary: copying ${entry} -> ${runtimeName}`);
          await fs.promises.copyFile(srcPath, destPath);
        }
        engineCopied = true;
      }
    } catch (err) {
      // readdir failed — the node_modules/prisma/ directory was not created
      // by `prisma generate`, which can happen with prisma versions that
      // place engine binaries in a different location.
      throw new NowBuildError({
        code: 'PRISMA_ENGINE_NOT_FOUND',
        message:
          `could not read Prisma engine directory "${nodeModulesDir}". ` +
          `This may indicate an incompatible prisma version.\n` +
          (err instanceof Error ? err.message : String(err)),
      });
    }

    if (!engineCopied) {
      throw new NowBuildError({
        code: 'PRISMA_ENGINE_NOT_FOUND',
        message:
          `could not find engine binary matching "${srcBinaryPrefix}*" ` +
          `in "${nodeModulesDir}". This may indicate an incompatible ` +
          `prisma version or an unsupported platform (${process.arch}).`,
      });
    }

    // 6. Create an openssl shim so prisma-client-py's platform detection
    //    works even in environments where the real openssl binary is missing.
    //    prisma runs `openssl version -v` and parses the major.minor version;
    //    this shim returns a string that resolves to RUNTIME_OPENSSL_VERSION.
    const shimPath = join(cacheDir, 'openssl');
    await fs.promises.writeFile(
      shimPath,
      `#!/bin/sh\necho "OpenSSL ${RUNTIME_OPENSSL_VERSION}.0 1 Jan 2024 (Library: OpenSSL ${RUNTIME_OPENSSL_VERSION}.0)"\n`
    );
    await fs.promises.chmod(shimPath, 0o755);

    // 7. Clean up dummy-generate artifacts.
    //    workPath artifacts (dummy schema and generated dir) MUST be removed;
    //    leaving them would cause them to be bundled into the Lambda zip.
    for (const p of [generatedDir, dummySchemaPath]) {
      await fs.promises.rm(p, { recursive: true, force: true });
    }
    await cleanCacheArtifacts(cacheDir);

    // 8. If the project has a schema.prisma, generate the client so it
    //    matches the user's actual models.  Controlled by
    //    VERCEL_PRISMA_GENERATE_CLIENT: "auto" (default) skips when the
    //    client is already generated, "always" regenerates unconditionally,
    //    "never" skips entirely.
    const generateMode = (
      process.env.VERCEL_PRISMA_GENERATE_CLIENT ?? 'auto'
    ).toLowerCase();
    const userSchema =
      generateMode !== 'never' ? await findUserSchema(workPath) : null;
    if (userSchema) {
      let shouldGenerate = true;
      if (generateMode === 'auto') {
        const clientAlreadyGenerated = await isClientGenerated(
          pythonPath,
          pythonEnv
        );
        if (clientAlreadyGenerated) {
          debug(
            'Prisma quirk: client already generated, skipping user schema generate'
          );
          shouldGenerate = false;
        }
      }
      if (shouldGenerate) {
        debug(`Running prisma generate with user schema: ${userSchema}`);
        try {
          const userResult = await execa(
            pythonPath,
            ['-m', 'prisma', 'generate', `--schema=${userSchema}`],
            {
              cwd: workPath,
              env: generateEnv,
              stdio: 'pipe',
            }
          );
          if (userResult.stdout)
            debug(`prisma generate stdout: ${userResult.stdout}`);
          if (userResult.stderr)
            debug(`prisma generate stderr: ${userResult.stderr}`);
        } catch (err: unknown) {
          throw new NowBuildError({
            code: 'PRISMA_GENERATE_FAILED',
            message:
              `\`prisma generate\` failed for schema "${userSchema}".\n` +
              execErrorMessage(err),
          });
        }
        // Clean up any new cache artifacts the user generate created
        await cleanCacheArtifacts(cacheDir);
      }
    }

    // 9. Patch prisma's RECORD: add bincache entries and any files
    //    created by prisma generate that are not already tracked.
    try {
      const allFiles = await collectFiles(
        join(sitePackages, 'prisma'),
        sitePackages
      );
      const count = await extendDistRecord(sitePackages, 'prisma', allFiles);
      if (count > 0) {
        debug(`Appended ${count} entries to prisma RECORD`);
      }
    } catch (err) {
      console.warn(
        `could not patch prisma RECORD: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 10. Return env vars for both Lambda runtime and subsequent build steps.
    //     PRISMA_BINARY_CACHE_DIR: prisma-client-py resolves the engine binary
    //       from this directory (via config.binary_cache_dir).
    //     VERCEL_RUNTIME_ENV_PATH_PREPEND: vc_init.py prepends these dirs to PATH so the
    //       openssl shim is found by prisma's platform detection.
    return {
      env: {
        PRISMA_BINARY_CACHE_DIR: runtimeCacheDir,
        VERCEL_RUNTIME_ENV_PATH_PREPEND: runtimeCacheDir,
      },
      buildEnv: { PRISMA_BINARY_CACHE_DIR: cacheDir },
      alwaysBundlePackages: ['prisma'],
    };
  },
};
