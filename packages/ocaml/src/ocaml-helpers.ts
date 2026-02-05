/**
 * OCaml/opam/dune helpers for Vercel runtime.
 *
 * This module provides utilities for:
 * - Downloading and managing opam
 * - Creating/restoring OCaml compiler switches
 * - Installing dependencies
 * - Building with dune
 */

import execa from 'execa';
import { join } from 'path';
import { pathExists, readFile, mkdirp, chmod, writeFile } from 'fs-extra';
import { debug } from '@vercel/build-utils';

const DEFAULT_OCAML_VERSION = '5.1.1';

/**
 * Query opam for the latest patch version matching a major.minor prefix.
 * E.g., "5.1" -> "5.1.1"
 */
async function findLatestPatchVersion(
  opamBin: string,
  opamRoot: string,
  majorMinor: string
): Promise<string> {
  try {
    // Query available versions of ocaml-base-compiler
    const result = await execa(opamBin, [
      'show',
      'ocaml-base-compiler',
      '--field=all-versions',
      '--root',
      opamRoot,
    ]);

    // Parse versions and find matches for our major.minor
    const versions = result.stdout.trim().split(/\s+/);
    const matching = versions
      .filter(v => v.startsWith(`${majorMinor}.`))
      .sort((a, b) => {
        // Sort by patch version descending
        const patchA = parseInt(a.split('.')[2] || '0', 10);
        const patchB = parseInt(b.split('.')[2] || '0', 10);
        return patchB - patchA;
      });

    if (matching.length > 0) {
      debug(`Found versions for ${majorMinor}: ${matching.join(', ')}`);
      return matching[0]; // Return highest patch version
    }
  } catch (err) {
    debug(`Failed to query opam for versions: ${err}`);
  }

  // Fallback: try .0 first, then .1
  return `${majorMinor}.0`;
}

const OPAM_VERSION = '2.5.0';
const LIBEV_VERSION = '4.33';
const GMP_VERSION = '6.3.0';

export const localCacheDir = '.vercel/cache/ocaml';

export interface OpamWrapper {
  install: () => Promise<void>;
  build: () => Promise<void>;
  env: NodeJS.ProcessEnv;
}

/**
 * Ensure required system tools are available.
 * opam requires diff and patch which may not be in minimal containers.
 * Always installs busybox to cache and creates symlinks.
 */
async function ensureRequiredTools(
  cacheDir: string,
  arch: string
): Promise<string> {
  const binDir = join(cacheDir, 'bin');
  await mkdirp(binDir);

  // Check if diff and patch are already available
  let hasDiff = false;
  let hasPatch = false;

  try {
    await execa('which', ['diff']);
    hasDiff = true;
    debug('Found diff in PATH');
  } catch {
    // not found
  }

  try {
    await execa('which', ['patch']);
    hasPatch = true;
    debug('Found patch in PATH');
  } catch {
    // not found
  }

  // If both tools are available, we're done
  if (hasDiff && hasPatch) {
    return binDir;
  }

  // Need to install missing tools via busybox
  // Only x86_64 is supported - busybox static binaries aren't available for arm64
  if (arch === 'arm64') {
    throw new Error(
      `OCaml builds are not supported on arm64 architecture.\n` +
        `Please use x86_64 architecture for OCaml projects.`
    );
  }

  const busyboxPath = join(binDir, 'busybox');

  // Download busybox if not cached
  if (!(await pathExists(busyboxPath))) {
    debug('Downloading busybox for required tools (diff, patch)...');
    const url =
      'https://busybox.net/downloads/binaries/1.35.0-x86_64-linux-musl/busybox';

    await execa('curl', ['-fsSL', '-o', busyboxPath, url]);
    await chmod(busyboxPath, 0o755);
    debug(`Downloaded busybox from ${url}`);
  }

  // Create symlinks for missing tools
  if (!hasDiff) {
    const diffPath = join(binDir, 'diff');
    if (!(await pathExists(diffPath))) {
      await execa('ln', ['-sf', 'busybox', 'diff'], { cwd: binDir });
      debug('Created diff symlink to busybox');
    }
  }

  if (!hasPatch) {
    const patchPath = join(binDir, 'patch');
    if (!(await pathExists(patchPath))) {
      await execa('ln', ['-sf', 'busybox', 'patch'], { cwd: binDir });
      debug('Created patch symlink to busybox');
    }
  }

  return binDir;
}

/**
 * Download and compile libev from source.
 * This is required for Dream and other frameworks that depend on conf-libev.
 * Returns the prefix path where libev is installed.
 */
async function installLibev(cacheDir: string): Promise<string> {
  const libevPrefix = join(cacheDir, 'libev');
  const libevLib = join(libevPrefix, 'lib', 'libev.a');

  // Check if already cached
  if (await pathExists(libevLib)) {
    debug('Using cached libev installation');
    return libevPrefix;
  }

  debug(`Installing libev ${LIBEV_VERSION} from source...`);

  const tmpDir = join(cacheDir, 'tmp-libev');
  await mkdirp(tmpDir);

  const tarball = join(tmpDir, 'libev.tar.gz');
  const url = `http://dist.schmorp.de/libev/libev-${LIBEV_VERSION}.tar.gz`;

  // Download libev source
  debug(`Downloading libev from ${url}...`);
  await execa('curl', ['-fsSL', '-o', tarball, url]);

  // Extract
  await execa('tar', ['xzf', tarball], { cwd: tmpDir });

  const srcDir = join(tmpDir, `libev-${LIBEV_VERSION}`);

  // Configure and build
  debug('Configuring libev...');
  await execa('./configure', [`--prefix=${libevPrefix}`], {
    cwd: srcDir,
    stdio: 'inherit',
  });

  debug('Building libev...');
  await execa('make', ['-j4'], { cwd: srcDir, stdio: 'inherit' });

  debug('Installing libev...');
  await execa('make', ['install'], { cwd: srcDir, stdio: 'inherit' });

  // Cleanup tmp directory
  await execa('rm', ['-rf', tmpDir]);

  debug(`libev installed to ${libevPrefix}`);
  return libevPrefix;
}

/**
 * Download and compile GMP from source.
 * This is required for cryptographic packages (mirage-crypto, zarith, etc.)
 * Returns the prefix path where GMP is installed.
 */
async function installGmp(cacheDir: string): Promise<string> {
  const gmpPrefix = join(cacheDir, 'gmp');
  const gmpLib = join(gmpPrefix, 'lib', 'libgmp.a');

  // Check if already cached
  if (await pathExists(gmpLib)) {
    debug('Using cached GMP installation');
    return gmpPrefix;
  }

  debug(`Installing GMP ${GMP_VERSION} from source...`);

  const tmpDir = join(cacheDir, 'tmp-gmp');
  await mkdirp(tmpDir);

  const tarball = join(tmpDir, 'gmp.tar.xz');
  const url = `https://gmplib.org/download/gmp/gmp-${GMP_VERSION}.tar.xz`;

  // Download GMP source
  debug(`Downloading GMP from ${url}...`);
  await execa('curl', ['-fsSL', '-o', tarball, url]);

  // Extract (xz format)
  await execa('tar', ['xJf', tarball], { cwd: tmpDir });

  const srcDir = join(tmpDir, `gmp-${GMP_VERSION}`);

  // Configure and build
  debug('Configuring GMP...');
  await execa('./configure', [`--prefix=${gmpPrefix}`, '--enable-shared'], {
    cwd: srcDir,
    stdio: 'inherit',
  });

  debug('Building GMP...');
  await execa('make', ['-j4'], { cwd: srcDir, stdio: 'inherit' });

  debug('Installing GMP...');
  await execa('make', ['install'], { cwd: srcDir, stdio: 'inherit' });

  // Cleanup tmp directory
  await execa('rm', ['-rf', tmpDir]);

  debug(`GMP installed to ${gmpPrefix}`);
  return gmpPrefix;
}

/**
 * Download opam binary for the target architecture
 */
async function downloadOpam(cacheDir: string, arch: string): Promise<string> {
  const binDir = join(cacheDir, 'bin');
  await mkdirp(binDir);

  const opamPath = join(binDir, 'opam');
  if (await pathExists(opamPath)) {
    debug('Using cached opam binary');
    return opamPath;
  }

  const archSuffix = arch === 'arm64' ? 'arm64' : 'x86_64';
  const url = `https://github.com/ocaml/opam/releases/download/${OPAM_VERSION}/opam-${OPAM_VERSION}-${archSuffix}-linux`;

  debug(`Downloading opam from ${url}...`);
  await execa('curl', ['-fsSL', '-o', opamPath, url]);
  await chmod(opamPath, 0o755);

  return opamPath;
}

/**
 * Detect OCaml version from dune-project or opam file
 */
async function detectOcamlVersion(workPath: string): Promise<string | null> {
  // Try dune-project first
  const duneProject = join(workPath, 'dune-project');
  if (await pathExists(duneProject)) {
    const content = await readFile(duneProject, 'utf-8');
    // Match patterns like (ocaml (>= 5.1)) or (ocaml (>= 5.1.1))
    const match = content.match(/\(ocaml\s*\(>=?\s*(\d+\.\d+(?:\.\d+)?)\)\)/);
    if (match) {
      debug(`Detected OCaml version from dune-project: ${match[1]}`);
      return match[1];
    }
  }

  // Try to find .opam file
  const opamFiles = await findOpamFiles(workPath);
  for (const opamFile of opamFiles) {
    const content = await readFile(opamFile, 'utf-8');
    // Match depends section with ocaml constraint
    const match = content.match(/"ocaml"\s*\{\s*>=?\s*"(\d+\.\d+(?:\.\d+)?)"/);
    if (match) {
      debug(`Detected OCaml version from ${opamFile}: ${match[1]}`);
      return match[1];
    }
  }

  return null;
}

/**
 * Find all .opam files in the work path
 */
async function findOpamFiles(workPath: string): Promise<string[]> {
  const files: string[] = [];
  const { readdir } = await import('fs-extra');
  const entries = await readdir(workPath);

  for (const entry of entries) {
    if (entry.endsWith('.opam')) {
      files.push(join(workPath, entry));
    }
  }

  return files;
}

/**
 * Get project name from dune-project
 */
export async function getProjectName(workPath: string): Promise<string> {
  const duneProject = join(workPath, 'dune-project');
  if (await pathExists(duneProject)) {
    const content = await readFile(duneProject, 'utf-8');
    const match = content.match(/\(name\s+(\S+)\)/);
    if (match) {
      return match[1];
    }
  }
  return 'app';
}

/**
 * Find the built executable path by examining dune files
 */
export async function findExecutablePath(workPath: string): Promise<string> {
  const duneFiles = ['bin/dune', 'src/dune', 'dune'];

  for (const duneFile of duneFiles) {
    const dunePath = join(workPath, duneFile);
    if (await pathExists(dunePath)) {
      const content = await readFile(dunePath, 'utf-8');

      // Look for public_name first (preferred)
      const pubMatch = content.match(
        /\(executable[\s\S]*?\(public_name\s+(\S+)\)/
      );
      if (pubMatch) {
        const dir = duneFile.replace('/dune', '').replace('dune', '.');
        return join('_build', 'default', dir, pubMatch[1] + '.exe');
      }

      // Fall back to name
      const nameMatch = content.match(/\(executable[\s\S]*?\(name\s+(\S+)\)/);
      if (nameMatch) {
        const dir = duneFile.replace('/dune', '').replace('dune', '.');
        return join('_build', 'default', dir, nameMatch[1] + '.exe');
      }
    }
  }

  // Default fallback
  return '_build/default/bin/main.exe';
}

/**
 * Initialize opam and create a wrapper for building
 */
export async function createOpam(options: {
  workPath: string;
  arch?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<OpamWrapper> {
  const { workPath, arch = 'x86_64', env = process.env } = options;

  const cacheDir = join(workPath, localCacheDir);
  const opamRoot = join(cacheDir, 'opam-root');

  // Ensure required tools (diff, patch) are available
  const toolsBinDir = await ensureRequiredTools(cacheDir, arch);

  // Install native dependencies (required for Dream and crypto packages)
  const libevPrefix = await installLibev(cacheDir);
  const gmpPrefix = await installGmp(cacheDir);

  const opamBin = await downloadOpam(cacheDir, arch);

  // Set up environment with native library paths for compilation and linking
  const libevInclude = join(libevPrefix, 'include');
  const libevLib = join(libevPrefix, 'lib');
  const gmpInclude = join(gmpPrefix, 'include');
  const gmpLib = join(gmpPrefix, 'lib');

  // Support user-vendored native dependencies
  // Users can put pre-compiled libs in .vercel/deps/ or vendor/
  const userDepsDir = join(workPath, '.vercel', 'deps');
  const vendorDir = join(workPath, 'vendor');

  const includePaths: string[] = [libevInclude, gmpInclude];
  const libPaths: string[] = [libevLib, gmpLib];

  // Add user deps if they exist
  if (await pathExists(join(userDepsDir, 'include'))) {
    includePaths.unshift(join(userDepsDir, 'include'));
    debug(`Found user deps include: ${userDepsDir}/include`);
  }
  if (await pathExists(join(userDepsDir, 'lib'))) {
    libPaths.unshift(join(userDepsDir, 'lib'));
    debug(`Found user deps lib: ${userDepsDir}/lib`);
  }
  if (await pathExists(join(vendorDir, 'include'))) {
    includePaths.unshift(join(vendorDir, 'include'));
    debug(`Found vendor include: ${vendorDir}/include`);
  }
  if (await pathExists(join(vendorDir, 'lib'))) {
    libPaths.unshift(join(vendorDir, 'lib'));
    debug(`Found vendor lib: ${vendorDir}/lib`);
  }

  const includePathStr = includePaths.join(':');
  const libPathStr = libPaths.join(':');
  const cflagsIncludes = includePaths.map(p => `-I${p}`).join(' ');
  const ldflagsLibs = libPaths.map(p => `-L${p}`).join(' ');

  const baseEnv: NodeJS.ProcessEnv = {
    ...env,
    // Add tools bin dir to PATH (for diff, patch from busybox if needed)
    PATH: `${toolsBinDir}:${env.PATH || ''}`,
    // Compiler/linker paths for native libs
    C_INCLUDE_PATH: `${includePathStr}:${env.C_INCLUDE_PATH || ''}`,
    LIBRARY_PATH: `${libPathStr}:${env.LIBRARY_PATH || ''}`,
    LD_LIBRARY_PATH: `${libPathStr}:${env.LD_LIBRARY_PATH || ''}`,
    CFLAGS: `${cflagsIncludes} ${env.CFLAGS || ''}`.trim(),
    LDFLAGS: `${ldflagsLibs} ${env.LDFLAGS || ''}`.trim(),
    // Non-interactive mode for opam
    OPAMYES: '1',
    OPAMCOLOR: 'never',
  };

  // Always initialize opam first (needed to query versions)
  const opamInitialized = await pathExists(join(opamRoot, 'config'));
  if (!opamInitialized) {
    debug('Initializing opam...');
    await execa(
      opamBin,
      [
        'init',
        '--bare',
        '--no-setup',
        '--disable-sandboxing',
        '--root',
        opamRoot,
      ],
      { env: baseEnv, stdio: 'inherit' }
    );
  }

  // Detect version from project
  const detectedVersion =
    (await detectOcamlVersion(workPath)) || DEFAULT_OCAML_VERSION;

  // Normalize to full version (e.g., 5.1 -> 5.1.1) by querying opam
  let ocamlVersion = detectedVersion;
  if (!/^\d+\.\d+\.\d+$/.test(detectedVersion)) {
    ocamlVersion = await findLatestPatchVersion(
      opamBin,
      opamRoot,
      detectedVersion
    );
  }
  debug(`Using OCaml version: ${ocamlVersion} (detected: ${detectedVersion})`);

  const switchPath = join(opamRoot, ocamlVersion);
  const switchExists = await pathExists(switchPath);

  if (!switchExists) {
    debug(`Creating OCaml ${ocamlVersion} switch...`);
    await execa(
      opamBin,
      [
        'switch',
        'create',
        ocamlVersion,
        `ocaml-base-compiler.${ocamlVersion}`,
        '--root',
        opamRoot,
      ],
      { env: baseEnv, stdio: 'inherit' }
    );
  } else {
    debug(`Using cached OCaml ${ocamlVersion} switch`);
  }

  const opamEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    OPAMROOT: opamRoot,
    OPAMSWITCH: ocamlVersion,
    OPAMYES: '1',
    OPAMCOLOR: 'never',
    PATH: `${join(opamRoot, ocamlVersion, 'bin')}:${toolsBinDir}:${env.PATH || ''}`,
  };

  return {
    env: opamEnv,

    install: async () => {
      debug('Installing OCaml dependencies...');
      const projectName = await getProjectName(workPath);
      const lockFile = join(workPath, `${projectName}.opam.locked`);

      // Use --assume-depexts to skip system package manager checks
      // since we've installed libev locally
      const args = [
        'install',
        '--deps-only',
        '.',
        '--root',
        opamRoot,
        '--assume-depexts',
      ];
      if (await pathExists(lockFile)) {
        args.push('--locked');
        debug(`Using locked dependencies from ${lockFile}`);
      }

      await execa(opamBin, args, {
        cwd: workPath,
        env: opamEnv,
        stdio: 'inherit',
      });
    },

    build: async () => {
      debug('Building with dune...');
      await execa('dune', ['build', '--release'], {
        cwd: workPath,
        env: opamEnv,
        stdio: 'inherit',
      });
    },
  };
}

/**
 * Build the OCaml bootstrap wrapper (vc-init.ml)
 */
export async function buildBootstrap(
  opamEnv: NodeJS.ProcessEnv,
  srcPath: string,
  outPath: string
): Promise<void> {
  const { getWriteableDirectory } = await import('@vercel/build-utils');
  const { copy } = await import('fs-extra');

  const bootstrapDir = await getWriteableDirectory();

  // Copy the vc-init.ml source file
  await copy(srcPath, join(bootstrapDir, 'vc_init.ml'));

  // Create minimal dune-project
  await writeFile(join(bootstrapDir, 'dune-project'), '(lang dune 3.0)\n');

  // Create dune build file
  await writeFile(
    join(bootstrapDir, 'dune'),
    '(executable (name vc_init) (libraries unix))\n'
  );

  debug(`Building bootstrap wrapper in ${bootstrapDir}...`);
  await execa('dune', ['build', '--release', 'vc_init.exe'], {
    cwd: bootstrapDir,
    env: opamEnv,
    stdio: 'inherit',
  });

  await copy(join(bootstrapDir, '_build', 'default', 'vc_init.exe'), outPath);
  await chmod(outPath, 0o755);
  debug(`Bootstrap built successfully: ${outPath}`);
}
