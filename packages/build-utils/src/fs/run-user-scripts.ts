import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import Sema from 'async-sema';
import spawn from 'cross-spawn';
import {
  coerce,
  intersects,
  SemVer,
  validRange,
  parse,
  satisfies,
  gte,
  minVersion,
} from 'semver';
import { SpawnOptions } from 'child_process';
import { deprecate } from 'util';
import debug from '../debug';
import { NowBuildError } from '../errors';
import { Meta, PackageJson, NodeVersion, Config } from '../types';
import {
  getSupportedNodeVersion,
  getLatestNodeVersion,
  getAvailableNodeVersions,
} from './node-version';
import { readConfigFile } from './read-config-file';
import { cloneEnv } from '../clone-env';
import json5 from 'json5';
import yaml from 'js-yaml';

const NO_OVERRIDE = {
  detectedLockfile: undefined,
  detectedPackageManager: undefined,
  path: undefined,
};

export type CliType = 'yarn' | 'npm' | 'pnpm' | 'bun';

export interface ScanParentDirsResult {
  /**
   * "yarn", "npm", or "pnpm" depending on the presence of lockfiles.
   */
  cliType: CliType;
  /**
   * The file path of found `package.json` file, or `undefined` if not found.
   */
  packageJsonPath?: string;
  /**
   * The contents of found `package.json` file, when the `readPackageJson`
   * option is enabled.
   */
  packageJson?: PackageJson;
  /**
   * The file path of the lockfile (`yarn.lock`, `package-lock.json`, or `pnpm-lock.yaml`)
   * or `undefined` if not found.
   */
  lockfilePath?: string;
  /**
   * The `lockfileVersion` number from lockfile (`package-lock.json` or `pnpm-lock.yaml`),
   * or `undefined` if not found.
   */
  lockfileVersion?: number;
  /**
   * The contents of the `packageManager` field from `package.json` if found.
   * The value may come from a different `package.json` file than the one
   * specified by `packageJsonPath`, in the case of a monorepo.
   */
  packageJsonPackageManager?: string;
  /**
   * Whether Turborepo supports the `COREPACK_HOME` environment variable.
   * `undefined` if not a Turborepo project.
   */
  turboSupportsCorepackHome?: boolean;
}

export interface TraverseUpDirectoriesProps {
  /**
   * The directory to start iterating from, typically the same directory of the entrypoint.
   */
  start: string;
  /**
   * The highest directory, typically the workPath root of the project.
   */
  base?: string;
}

export interface WalkParentDirsProps
  extends Required<TraverseUpDirectoriesProps> {
  /**
   * The name of the file to search for, typically `package.json` or `Gemfile`.
   */
  filename: string;
}

export interface WalkParentDirsMultiProps
  extends Required<TraverseUpDirectoriesProps> {
  /**
   * The name of the file to search for, typically `package.json` or `Gemfile`.
   */
  filenames: string[];
}

export interface SpawnOptionsExtended extends SpawnOptions {
  /**
   * Pretty formatted command that is being spawned for logging purposes.
   */
  prettyCommand?: string;

  /**
   * Returns instead of throwing an error when the process exits with a
   * non-0 exit code. When relevant, the returned object will include
   * the error code, stdout and stderr.
   */
  ignoreNon0Exit?: boolean;
}

export function spawnAsync(
  command: string,
  args: string[],
  opts: SpawnOptionsExtended = {}
) {
  return new Promise<void>((resolve, reject) => {
    const stderrLogs: Buffer[] = [];
    opts = { stdio: 'inherit', ...opts };
    const child = spawn(command, args, opts);

    if (opts.stdio === 'pipe' && child.stderr) {
      child.stderr.on('data', data => stderrLogs.push(data));
    }

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0 || opts.ignoreNon0Exit) {
        return resolve();
      }

      const cmd = opts.prettyCommand
        ? `Command "${opts.prettyCommand}"`
        : 'Command';
      reject(
        new NowBuildError({
          code: `BUILD_UTILS_SPAWN_${code || signal}`,
          message:
            opts.stdio === 'inherit'
              ? `${cmd} exited with ${code || signal}`
              : stderrLogs.map(line => line.toString()).join(''),
        })
      );
    });
  });
}

export function spawnCommand(command: string, options: SpawnOptions = {}) {
  const opts = { ...options, prettyCommand: command };
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/C', command], opts);
  }

  return spawn('sh', ['-c', command], opts);
}

export async function execCommand(command: string, options: SpawnOptions = {}) {
  const opts = { ...options, prettyCommand: command };
  if (process.platform === 'win32') {
    await spawnAsync('cmd.exe', ['/C', command], opts);
  } else {
    await spawnAsync('sh', ['-c', command], opts);
  }

  return true;
}

export function* traverseUpDirectories({
  start,
  base,
}: TraverseUpDirectoriesProps) {
  let current: string | undefined = path.normalize(start);
  const normalizedRoot = base ? path.normalize(base) : undefined;
  while (current) {
    yield current;
    if (current === normalizedRoot) break;
    // Go up one directory
    const next = path.join(current, '..');
    current = next === current ? undefined : next;
  }
}

async function readProjectRootInfo({
  start,
  base,
}: TraverseUpDirectoriesProps): Promise<
  | {
      packageJson: PackageJson;
      rootDir: string;
    }
  | undefined
> {
  let curRootPackageJsonPath: string | undefined;
  for (const dir of traverseUpDirectories({ start, base })) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      curRootPackageJsonPath = packageJsonPath;
    }
  }
  return curRootPackageJsonPath
    ? {
        packageJson: await fs.readJson(curRootPackageJsonPath),
        rootDir: path.dirname(curRootPackageJsonPath),
      }
    : undefined;
}

/**
 * @deprecated Use `getNodeBinPaths()` instead.
 */
export async function getNodeBinPath({
  cwd,
}: {
  cwd: string;
}): Promise<string> {
  const { lockfilePath } = await scanParentDirs(cwd);
  const dir = path.dirname(lockfilePath || cwd);
  return path.join(dir, 'node_modules', '.bin');
}

export function getNodeBinPaths({
  start,
  base,
}: TraverseUpDirectoriesProps): string[] {
  return Array.from(traverseUpDirectories({ start, base })).map(dir =>
    path.join(dir, 'node_modules/.bin')
  );
}

async function chmodPlusX(fsPath: string) {
  const s = await fs.stat(fsPath);
  const newMode = s.mode | 64 | 8 | 1; // eslint-disable-line no-bitwise
  if (s.mode === newMode) return;
  const base8 = newMode.toString(8).slice(-3);
  await fs.chmod(fsPath, base8);
}

export async function runShellScript(
  fsPath: string,
  args: string[] = [],
  spawnOpts?: SpawnOptions
) {
  assert(path.isAbsolute(fsPath));
  const destPath = path.dirname(fsPath);
  await chmodPlusX(fsPath);
  const command = `./${path.basename(fsPath)}`;
  await spawnAsync(command, args, {
    ...spawnOpts,
    cwd: destPath,
    prettyCommand: command,
  });
  return true;
}

export function getSpawnOptions(
  meta: Meta,
  nodeVersion: NodeVersion
): SpawnOptions {
  const opts = {
    env: cloneEnv(process.env),
  };

  if (!meta.isDev) {
    let found = false;
    const oldPath = opts.env.PATH || process.env.PATH || '';

    const pathSegments = oldPath.split(path.delimiter).map(segment => {
      if (/^\/node[0-9]+\/bin/.test(segment)) {
        found = true;
        return `/node${nodeVersion.major}/bin`;
      }
      return segment;
    });

    if (!found) {
      // If we didn't find & replace, prepend at beginning of PATH
      pathSegments.unshift(`/node${nodeVersion.major}/bin`);
    }

    opts.env.PATH = pathSegments.filter(Boolean).join(path.delimiter);
  }

  return opts;
}

export async function getNodeVersion(
  destPath: string,
  fallbackVersion = process.env.VERCEL_PROJECT_SETTINGS_NODE_VERSION,
  config: Config = {},
  meta: Meta = {},
  availableVersions = getAvailableNodeVersions()
): Promise<NodeVersion> {
  const latestVersion = getLatestNodeVersion(availableVersions);
  if (meta.isDev) {
    // Use the system-installed version of `node` in PATH for `vercel dev`
    latestVersion.runtime = 'nodejs';
    return latestVersion;
  }
  const { packageJson } = await scanParentDirs(destPath, true);
  const configuredVersion = config.nodeVersion || fallbackVersion;

  const packageJsonVersion = packageJson?.engines?.node;
  const supportedNodeVersion = await getSupportedNodeVersion(
    packageJsonVersion || configuredVersion,
    !packageJsonVersion,
    availableVersions
  );

  if (packageJson?.engines?.node) {
    const { node } = packageJson.engines;
    if (
      configuredVersion &&
      !intersects(configuredVersion, supportedNodeVersion.range)
    ) {
      console.warn(
        `Warning: Due to "engines": { "node": "${node}" } in your \`package.json\` file, the Node.js Version defined in your Project Settings ("${configuredVersion}") will not apply, Node.js Version "${supportedNodeVersion.range}" will be used instead. Learn More: http://vercel.link/node-version`
      );
    }

    if (coerce(node)?.raw === node) {
      console.warn(
        `Warning: Detected "engines": { "node": "${node}" } in your \`package.json\` with major.minor.patch, but only major Node.js Version can be selected. Learn More: http://vercel.link/node-version`
      );
    } else if (
      validRange(node) &&
      intersects(`${latestVersion.major + 1}.x`, node)
    ) {
      console.warn(
        `Warning: Detected "engines": { "node": "${node}" } in your \`package.json\` that will automatically upgrade when a new major Node.js Version is released. Learn More: http://vercel.link/node-version`
      );
    }
  }
  return supportedNodeVersion;
}

export async function scanParentDirs(
  destPath: string,
  readPackageJson = false,
  base = '/'
): Promise<ScanParentDirsResult> {
  assert(path.isAbsolute(destPath));

  const pkgJsonPath = await walkParentDirs({
    base,
    start: destPath,
    filename: 'package.json',
  });
  const packageJson: PackageJson | undefined =
    readPackageJson && pkgJsonPath
      ? JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'))
      : undefined;
  const {
    paths: [
      yarnLockPath,
      npmLockPath,
      pnpmLockPath,
      bunLockTextPath,
      bunLockBinPath,
    ],
    packageJsonPackageManager,
  } = await walkParentDirsMulti({
    base,
    start: destPath,
    filenames: [
      'yarn.lock',
      'package-lock.json',
      'pnpm-lock.yaml',
      'bun.lock',
      'bun.lockb',
    ],
  });
  let lockfilePath: string | undefined;
  let lockfileVersion: number | undefined;
  let cliType: CliType;

  const bunLockPath = bunLockTextPath ?? bunLockBinPath;
  const [packageLockJson, pnpmLockYaml, bunLock, yarnLock] = await Promise.all([
    npmLockPath
      ? readConfigFile<{ lockfileVersion: number }>(npmLockPath)
      : null,
    pnpmLockPath
      ? readConfigFile<{ lockfileVersion: number }>(pnpmLockPath)
      : null,
    bunLockPath ? fs.readFile(bunLockPath) : null,
    yarnLockPath ? fs.readFile(yarnLockPath, 'utf8') : null,
  ]);

  const rootProjectInfo = readPackageJson
    ? await readProjectRootInfo({
        base,
        start: destPath,
      })
    : undefined;
  const turboVersionRange =
    rootProjectInfo?.packageJson?.devDependencies?.turbo;
  const turboSupportsCorepackHome = turboVersionRange
    ? await checkTurboSupportsCorepack(
        turboVersionRange,
        rootProjectInfo?.rootDir
      )
    : undefined;

  // Priority order is bun with yarn lock > yarn > pnpm > npm > bun
  if (bunLock && yarnLock) {
    cliType = 'bun';
    lockfilePath = bunLockPath;
    lockfileVersion = bunLockTextPath ? 1 : 0;
  } else if (yarnLock) {
    cliType = 'yarn';
    lockfilePath = yarnLockPath;
    lockfileVersion = parseYarnLockVersion(yarnLock);
  } else if (pnpmLockYaml) {
    cliType = 'pnpm';
    lockfilePath = pnpmLockPath;
    lockfileVersion = Number(pnpmLockYaml.lockfileVersion);
  } else if (packageLockJson) {
    cliType = 'npm';
    lockfilePath = npmLockPath;
    lockfileVersion = packageLockJson.lockfileVersion;
  } else if (bunLock) {
    cliType = 'bun';
    lockfilePath = bunLockPath;
    lockfileVersion = bunLockTextPath ? 1 : 0;
  } else {
    cliType = detectPackageManagerNameWithoutLockfile(
      packageJsonPackageManager,
      turboSupportsCorepackHome
    );
  }

  const packageJsonPath = pkgJsonPath || undefined;
  return {
    cliType,
    packageJson,
    packageJsonPackageManager,
    lockfilePath,
    lockfileVersion,
    packageJsonPath,
    turboSupportsCorepackHome,
  };
}

function parseYarnLockVersion(yarnLock: string) {
  if (!yarnLock.includes('__metadata:')) {
    return 1; // Yarn 1.x lockfiles did not have metadata version
  }

  try {
    const metadata = yaml.load(yarnLock).__metadata;
    return Number(metadata.version);
  } catch {
    return undefined;
  }
}

async function checkTurboSupportsCorepack(
  turboVersionRange: string,
  rootDir: string
) {
  if (turboVersionSpecifierSupportsCorepack(turboVersionRange)) {
    return true;
  }
  const turboJsonPath = path.join(rootDir, 'turbo.json');
  const turboJsonExists = await fs.pathExists(turboJsonPath);

  let turboJson: null | unknown = null;
  if (turboJsonExists) {
    try {
      turboJson = json5.parse(await fs.readFile(turboJsonPath, 'utf8'));
    } catch (err) {
      console.warn(`WARNING: Failed to parse turbo.json`);
    }
  }

  const turboJsonIncludesCorepackHome =
    turboJson !== null &&
    typeof turboJson === 'object' &&
    'globalPassThroughEnv' in turboJson &&
    Array.isArray(turboJson.globalPassThroughEnv) &&
    turboJson.globalPassThroughEnv.includes('COREPACK_HOME');

  return turboJsonIncludesCorepackHome;
}

export function turboVersionSpecifierSupportsCorepack(
  turboVersionSpecifier: string
) {
  if (!validRange(turboVersionSpecifier)) {
    // Version specifiers can be things that aren't version ranges
    //   ex: "latest", "catalog:", tarball or git URLs
    // In these cases we can't easily determine if that version
    // supports corepack, so we assume it doesn't.
    return false;
  }
  const versionSupportingCorepack = '2.1.3';
  const minTurboBeingUsed = minVersion(turboVersionSpecifier);
  if (!minTurboBeingUsed) {
    return false;
  }
  return gte(minTurboBeingUsed, versionSupportingCorepack);
}

function detectPackageManagerNameWithoutLockfile(
  packageJsonPackageManager: string | undefined,
  turboSupportsCorepackHome: boolean | undefined
) {
  if (
    usingCorepack(
      process.env,
      packageJsonPackageManager,
      turboSupportsCorepackHome
    )
  ) {
    const corepackPackageManager = validateVersionSpecifier(
      packageJsonPackageManager
    );
    switch (corepackPackageManager?.packageName) {
      case 'npm':
      case 'pnpm':
      case 'yarn':
      case 'bun':
        return corepackPackageManager.packageName;
      case undefined:
        return 'npm';
      default:
        throw new Error(
          `Unknown package manager "${corepackPackageManager?.packageName}". Change your package.json "packageManager" field to a known package manager: npm, pnpm, yarn, bun.`
        );
    }
  }
  return 'npm';
}

export function usingCorepack(
  env: { [x: string]: string | undefined },
  packageJsonPackageManager: string | undefined,
  turboSupportsCorepackHome: boolean | undefined
) {
  if (
    env.ENABLE_EXPERIMENTAL_COREPACK !== '1' ||
    packageJsonPackageManager === undefined
  ) {
    return false;
  }
  if (turboSupportsCorepackHome === false) {
    console.warn(
      'Warning: Disabling corepack because it may break your project. To use corepack, either upgrade to `turbo@2.1.3+` or include `COREPACK_HOME` in `turbo.json#globalPassThroughEnv`.'
    );
    return false;
  }
  return true;
}

export async function walkParentDirs({
  base,
  start,
  filename,
}: WalkParentDirsProps): Promise<string | null> {
  assert(path.isAbsolute(base), 'Expected "base" to be absolute path');
  assert(path.isAbsolute(start), 'Expected "start" to be absolute path');

  for (const dir of traverseUpDirectories({ start, base })) {
    const fullPath = path.join(dir, filename);

    // eslint-disable-next-line no-await-in-loop
    if (await fs.pathExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

async function walkParentDirsMulti({
  base,
  start,
  filenames,
}: WalkParentDirsMultiProps): Promise<{
  paths: (string | undefined)[];
  packageJsonPackageManager?: string;
}> {
  let packageManager: string | undefined;

  for (const dir of traverseUpDirectories({ start, base })) {
    const fullPaths = filenames.map(f => path.join(dir, f));
    const existResults = await Promise.all(
      fullPaths.map(f => fs.pathExists(f))
    );
    const foundOneOrMore = existResults.some(b => b);
    const packageJsonPath = path.join(dir, 'package.json');
    const packageJson: PackageJson | null = await fs
      .readJSON(packageJsonPath)
      .catch(() => null);
    if (packageJson?.packageManager) {
      packageManager = packageJson.packageManager;
    }

    if (foundOneOrMore) {
      return {
        paths: fullPaths.map((f, i) => (existResults[i] ? f : undefined)),
        packageJsonPackageManager: packageManager,
      };
    }
  }

  return { paths: [], packageJsonPackageManager: packageManager };
}

function isSet<T>(v: any): v is Set<T> {
  return v?.constructor?.name === 'Set';
}

function getInstallCommandForPackageManager(
  packageManager: CliType,
  args: string[]
) {
  switch (packageManager) {
    case 'npm':
      return {
        prettyCommand: 'npm install',
        commandArguments: args
          .filter(a => a !== '--prefer-offline')
          .concat(['install', '--no-audit', '--unsafe-perm']),
      };
    case 'pnpm':
      return {
        prettyCommand: 'pnpm install',
        // PNPM's install command is similar to NPM's but without the audit nonsense
        // @see options https://pnpm.io/cli/install
        commandArguments: args
          .filter(a => a !== '--prefer-offline')
          .concat(['install', '--unsafe-perm']),
      };
    case 'bun':
      return {
        prettyCommand: 'bun install',
        // @see options https://bun.sh/docs/cli/install
        commandArguments: ['install', ...args],
      };
    case 'yarn':
      return {
        prettyCommand: 'yarn install',
        commandArguments: ['install', ...args],
      };
  }
}

async function runInstallCommand({
  packageManager,
  args,
  opts,
}: {
  packageManager: CliType;
  args: string[];
  opts: SpawnOptionsExtended;
}) {
  const { commandArguments, prettyCommand } =
    getInstallCommandForPackageManager(packageManager, args);
  opts.prettyCommand = prettyCommand;

  if (process.env.NPM_ONLY_PRODUCTION) {
    commandArguments.push('--production');
  }

  await spawnAsync(packageManager, commandArguments, opts);
}

function initializeSet(set: unknown) {
  if (!isSet<string>(set)) {
    return new Set<string>();
  }
  return set;
}

function checkIfAlreadyInstalled(
  runNpmInstallSet: unknown,
  packageJsonPath: string
) {
  const initializedRunNpmInstallSet = initializeSet(runNpmInstallSet);
  const alreadyInstalled = initializedRunNpmInstallSet.has(packageJsonPath);

  initializedRunNpmInstallSet.add(packageJsonPath);
  return { alreadyInstalled, runNpmInstallSet: initializedRunNpmInstallSet };
}

// Only allow one `runNpmInstall()` invocation to run concurrently
const runNpmInstallSema = new Sema(1);

export async function runNpmInstall(
  destPath: string,
  args: string[] = [],
  spawnOpts?: SpawnOptions,
  meta?: Meta,
  nodeVersion?: NodeVersion,
  projectCreatedAt?: number
): Promise<boolean> {
  if (meta?.isDev) {
    debug('Skipping dependency installation because dev mode is enabled');
    return false;
  }

  assert(path.isAbsolute(destPath));

  try {
    await runNpmInstallSema.acquire();
    const {
      cliType,
      packageJsonPath,
      packageJson,
      lockfileVersion,
      packageJsonPackageManager,
      turboSupportsCorepackHome,
    } = await scanParentDirs(destPath, true);

    if (!packageJsonPath) {
      debug(
        `Skipping dependency installation because no package.json was found for ${destPath}`
      );
      return false;
    }

    // Only allow `runNpmInstall()` to run once per `package.json`
    // when doing a default install (no additional args)
    const defaultInstall = args.length === 0;
    if (meta && packageJsonPath && defaultInstall) {
      const { alreadyInstalled, runNpmInstallSet } = checkIfAlreadyInstalled(
        meta.runNpmInstallSet,
        packageJsonPath
      );
      if (alreadyInstalled) {
        return false;
      }
      meta.runNpmInstallSet = runNpmInstallSet;
    }

    const installTime = Date.now();
    console.log('Installing dependencies...');
    debug(`Installing to ${destPath}`);

    const opts: SpawnOptionsExtended = { cwd: destPath, ...spawnOpts };
    const env = cloneEnv(opts.env || process.env);
    delete env.NODE_ENV;
    opts.env = getEnvForPackageManager({
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      nodeVersion,
      env,
      packageJsonEngines: packageJson?.engines,
      turboSupportsCorepackHome,
      projectCreatedAt,
    });

    await runInstallCommand({
      packageManager: cliType,
      args,
      opts,
    });

    debug(`Install complete [${Date.now() - installTime}ms]`);
    return true;
  } finally {
    runNpmInstallSema.release();
  }
}

/**
 * Prepares the input environment based on the used package manager and lockfile
 * versions.
 */
export function getEnvForPackageManager({
  cliType,
  lockfileVersion,
  packageJsonPackageManager,
  nodeVersion,
  env,
  packageJsonEngines,
  turboSupportsCorepackHome,
  projectCreatedAt,
}: {
  cliType: CliType;
  lockfileVersion: number | undefined;
  packageJsonPackageManager?: string | undefined;
  nodeVersion: NodeVersion | undefined;
  env: { [x: string]: string | undefined };
  packageJsonEngines?: PackageJson.Engines;
  turboSupportsCorepackHome?: boolean | undefined;
  projectCreatedAt?: number | undefined;
}) {
  const corepackEnabled = usingCorepack(
    env,
    packageJsonPackageManager,
    turboSupportsCorepackHome
  );

  const {
    detectedLockfile,
    detectedPackageManager,
    path: newPath,
  } = getPathOverrideForPackageManager({
    cliType,
    lockfileVersion,
    corepackPackageManager: packageJsonPackageManager,
    nodeVersion,
    corepackEnabled,
    packageJsonEngines,
    projectCreatedAt,
  });

  if (corepackEnabled) {
    debug(
      `Detected corepack use for "${packageJsonPackageManager}". Not overriding package manager version.`
    );
  } else {
    debug(
      `Detected ${detectedPackageManager}. Added "${newPath}" to path. Based on assumed package manager "${cliType}", lockfile "${detectedLockfile}", and lockfileVersion "${lockfileVersion}"`
    );
  }

  const newEnv: { [x: string]: string | undefined } = {
    ...env,
  };

  const alreadyInPath = (newPath: string) => {
    const oldPath = env.PATH ?? '';
    return oldPath.split(path.delimiter).includes(newPath);
  };

  if (newPath && !alreadyInPath(newPath)) {
    // Ensure that the binaries of the detected package manager are at the
    // beginning of the `$PATH`.
    const oldPath = env.PATH + '';
    newEnv.PATH = `${newPath}${path.delimiter}${oldPath}`;

    if (detectedLockfile && detectedPackageManager) {
      const detectedV9PnpmLockfile =
        detectedLockfile === 'pnpm-lock.yaml' && lockfileVersion === 9;
      const pnpm10UsingPackageJsonPackageManager =
        detectedPackageManager === 'pnpm@10.x' && packageJsonPackageManager;

      if (pnpm10UsingPackageJsonPackageManager) {
        const versionString =
          cliType === 'pnpm' ? `version ${lockfileVersion} ` : '';
        console.log(
          `Detected \`${detectedLockfile}\` ${versionString}generated by ${detectedPackageManager} with package.json#packageManager ${packageJsonPackageManager}`
        );
      } else if (detectedV9PnpmLockfile) {
        const otherVersion =
          detectedPackageManager === 'pnpm@10.x' ? `pnpm@9.x` : `pnpm@10.x`;
        console.log(
          `Detected \`${detectedLockfile}\` ${lockfileVersion} which may be generated by pnpm@9.x or pnpm@10.x\nUsing ${detectedPackageManager} based on project creation date\nTo use ${otherVersion}, manually opt in using corepack (https://vercel.com/docs/deployments/configure-a-build#corepack)`
        );
      } else {
        const versionString =
          cliType === 'pnpm' ? `version ${lockfileVersion} ` : '';
        // For pnpm we also show the version of the lockfile we found
        console.log(
          `Detected \`${detectedLockfile}\` ${versionString}generated by ${detectedPackageManager}`
        );
      }

      if (cliType === 'bun') {
        console.warn(
          'Warning: Bun is used as a package manager at build time only, not at runtime with Functions'
        );
      }
    }
  }

  if (cliType === 'yarn' && !env.YARN_NODE_LINKER) {
    newEnv.YARN_NODE_LINKER = 'node-modules';
  }

  return newEnv;
}

type DetectedPnpmVersion =
  | 'not found'
  | 'pnpm 6'
  | 'pnpm 7'
  | 'pnpm 8'
  | 'pnpm 9'
  | 'pnpm 10';

export const PNPM_10_PREFERRED_AT = new Date('2025-02-27T20:00:00Z');

function detectPnpmVersion(
  lockfileVersion: number | undefined,
  projectCreatedAt: number | undefined
): DetectedPnpmVersion {
  switch (true) {
    case lockfileVersion === undefined:
      return 'not found';
    case lockfileVersion === 5.3:
      return 'pnpm 6';
    case lockfileVersion === 5.4:
      return 'pnpm 7';
    case lockfileVersion === 6.0 || lockfileVersion === 6.1:
      return 'pnpm 8';
    case lockfileVersion === 7.0:
      return 'pnpm 9';
    case lockfileVersion === 9.0: {
      const projectPrefersPnpm10 =
        projectCreatedAt && projectCreatedAt >= PNPM_10_PREFERRED_AT.getTime();
      return projectPrefersPnpm10 ? 'pnpm 10' : 'pnpm 9';
    }
    default:
      return 'not found';
  }
}

function detectYarnVersion(lockfileVersion: number | undefined) {
  if (lockfileVersion) {
    if ([1].includes(lockfileVersion)) {
      return 'yarn@1.x';
    } else if ([4, 5].includes(lockfileVersion)) {
      return 'yarn@2.x';
    } else if ([6, 7].includes(lockfileVersion)) {
      return 'yarn@3.x';
    } else if ([8].includes(lockfileVersion)) {
      return 'yarn@4.x';
    }
  }
  return 'unknown yarn';
}

function validLockfileForPackageManager(
  cliType: CliType,
  lockfileVersion: number,
  packageManagerVersion: SemVer
) {
  const packageManagerMajorVersion = packageManagerVersion.major;
  switch (cliType) {
    case 'npm':
    case 'bun':
    case 'yarn':
      return true;
    case 'pnpm':
      switch (packageManagerMajorVersion) {
        case 10:
          return lockfileVersion === 9.0;
        case 9:
          // bug in pnpm 9.0.0 causes incompatibility with lockfile version 6.0
          if (
            '9.0.0' === packageManagerVersion.version &&
            lockfileVersion === 6.0
          ) {
            return false;
          }
          return [6.0, 7.0, 9.0].includes(lockfileVersion);
        case 8:
          return [6.0, 6.1].includes(lockfileVersion);
        case 7:
          return [5.3, 5.4].includes(lockfileVersion);
        case 6:
          return [5.3, 5.4].includes(lockfileVersion);
        default:
          return true;
      }
  }
}

/**
 * Helper to get the binary paths that link to the used package manager.
 * Note: Make sure it doesn't contain any `console.log` calls.
 */
export function getPathOverrideForPackageManager({
  cliType,
  lockfileVersion,
  corepackPackageManager,
  corepackEnabled = true,
  packageJsonEngines,
  projectCreatedAt,
}: {
  cliType: CliType;
  lockfileVersion: number | undefined;
  corepackPackageManager: string | undefined;
  nodeVersion: NodeVersion | undefined;
  corepackEnabled?: boolean;
  packageJsonEngines?: PackageJson.Engines;
  projectCreatedAt?: number;
}): {
  /**
   * Which lockfile was detected.
   */
  detectedLockfile: string | undefined;
  /**
   * Detected package manager that generated the found lockfile.
   */
  detectedPackageManager: string | undefined;
  /**
   * Value of $PATH that includes the binaries for the detected package manager.
   * Undefined if no $PATH are necessary.
   */
  path: string | undefined;
} {
  const detectedPackageManger = detectPackageManager(
    cliType,
    lockfileVersion,
    projectCreatedAt
  );

  const usingCorepack = corepackPackageManager && corepackEnabled;
  if (usingCorepack) {
    validateCorepackPackageManager(
      cliType,
      lockfileVersion,
      corepackPackageManager,
      packageJsonEngines?.pnpm
    );

    // corepack is going to take care of it; do nothing special
    return NO_OVERRIDE;
  }

  if (cliType === 'pnpm' && packageJsonEngines?.pnpm) {
    // pnpm 10 is special because
    // https://pnpm.io/npmrc#manage-package-manager-versions
    const usingDetected =
      detectedPackageManger?.pnpmVersionRange !== '10.x' ||
      !corepackPackageManager;
    if (usingDetected) {
      checkEnginesPnpmAgainstDetected(
        packageJsonEngines.pnpm,
        detectedPackageManger
      );
    }
  }

  return detectedPackageManger ?? NO_OVERRIDE;
}

function checkEnginesPnpmAgainstDetected(
  enginesPnpm: string,
  detectedPackageManger: ReturnType<typeof detectPackageManager>
) {
  if (
    detectedPackageManger?.pnpmVersionRange &&
    validRange(detectedPackageManger.pnpmVersionRange) &&
    validRange(enginesPnpm)
  ) {
    if (!intersects(detectedPackageManger.pnpmVersionRange, enginesPnpm)) {
      // detects ERR_PNPM_UNSUPPORTED_ENGINE and throws more helpful error
      throw new Error(
        `Detected pnpm "${detectedPackageManger.pnpmVersionRange}" is not compatible with the engines.pnpm "${enginesPnpm}" in your package.json. Either enable corepack with a valid package.json#packageManager value (https://vercel.com/docs/deployments/configure-a-build#corepack) or remove your package.json#engines.pnpm.`
      );
    }
  }
  console.warn(
    `Using package.json#engines.pnpm without corepack and package.json#packageManager could lead to failed builds with ERR_PNPM_UNSUPPORTED_ENGINE. Learn more: https://vercel.com/docs/errors/error-list#pnpm-engine-unsupported`
  );
}

function validateCorepackPackageManager(
  cliType: CliType,
  lockfileVersion: number | undefined,
  corepackPackageManager: string,
  enginesPnpmVersionRange: string | undefined
) {
  const validatedCorepackPackageManager = validateVersionSpecifier(
    corepackPackageManager
  );
  if (!validatedCorepackPackageManager) {
    throw new Error(
      `Intended corepack defined package manager "${corepackPackageManager}" is not a valid semver value.`
    );
  }

  if (cliType !== validatedCorepackPackageManager.packageName) {
    throw new Error(
      `Detected package manager "${cliType}" does not match intended corepack defined package manager "${validatedCorepackPackageManager.packageName}". Change your lockfile or "package.json#packageManager" value to match.`
    );
  }

  if (cliType === 'pnpm' && enginesPnpmVersionRange) {
    const pnpmWithinEngineRange = satisfies(
      validatedCorepackPackageManager.packageVersion,
      enginesPnpmVersionRange
    );
    if (!pnpmWithinEngineRange) {
      // pnpm would throw PNPM_UNSUPPORTED_ENGINE with
      // an unhelpful message. This catches that case
      // and throws a more helpful message.
      throw new Error(
        `The version of pnpm specified in package.json#packageManager (${validatedCorepackPackageManager.packageVersion}) must satisfy the version range in package.json#engines.pnpm (${enginesPnpmVersionRange}).`
      );
    }
  }

  if (lockfileVersion) {
    const lockfileValid = validLockfileForPackageManager(
      cliType,
      lockfileVersion,
      validatedCorepackPackageManager.packageVersion
    );
    if (!lockfileValid) {
      throw new Error(
        `Detected lockfile "${lockfileVersion}" which is not compatible with the intended corepack package manager "${corepackPackageManager}". Update your lockfile or change to a compatible corepack version.`
      );
    }
  }
}

function validateVersionSpecifier(version?: string) {
  if (!version) {
    return undefined;
  }

  const [before, after, ...extra] = version.split('@');

  if (extra.length) {
    // should not have more than one `@`
    return undefined;
  }

  if (!before) {
    // should have a package before the `@`
    return undefined;
  }

  if (!after) {
    // should have a version after the `@`
    return undefined;
  }

  const packageVersion = parse(after);
  if (!packageVersion) {
    // the version after the `@` should be a valid semver value
    return undefined;
  }

  return {
    packageName: before,
    packageVersion,
  };
}

export function detectPackageManager(
  cliType: CliType,
  lockfileVersion: number | undefined,
  projectCreatedAt?: number
) {
  switch (cliType) {
    case 'npm':
      // npm will be used, but we're going to let the version of Node.js
      // that's installed manage which version of npm will be used. So,
      // from this function's perspective, we're not specifying a version
      // of npm that will be used.
      return undefined;
    case 'pnpm':
      switch (detectPnpmVersion(lockfileVersion, projectCreatedAt)) {
        case 'pnpm 7':
          // pnpm 7
          return {
            path: '/pnpm7/node_modules/.bin',
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@7.x',
            pnpmVersionRange: '7.x',
          };
        case 'pnpm 8':
          // pnpm 8
          return {
            path: '/pnpm8/node_modules/.bin',
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@8.x',
            pnpmVersionRange: '8.x',
          };
        case 'pnpm 9':
          // pnpm 9
          return {
            path: '/pnpm9/node_modules/.bin',
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@9.x',
            pnpmVersionRange: '9.x',
          };
        case 'pnpm 10':
          // pnpm 10
          return {
            path: '/pnpm10/node_modules/.bin',
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@10.x',
            pnpmVersionRange: '10.x',
          };
        case 'pnpm 6':
          return {
            // undefined because pnpm@6 is the current default in the build container
            path: undefined,
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@6.x',
            pnpmVersionRange: '6.x',
          };
        default:
          return undefined;
      }
    case 'bun':
      return {
        path: '/bun1',
        detectedLockfile: lockfileVersion === 0 ? 'bun.lockb' : 'bun.lock',
        detectedPackageManager: 'bun@1.x',
      };
    case 'yarn':
      // yarn always uses the default version in the build container
      // which is why there's no `path` here
      return {
        path: undefined,
        detectedLockfile: 'yarn.lock',
        detectedPackageManager: detectYarnVersion(lockfileVersion),
      };
  }
}

/**
 * Helper to get the binary paths that link to the used package manager.
 * Note: Make sure it doesn't contain any `console.log` calls.
 * @deprecated use `getEnvForPackageManager` instead
 */
export function getPathForPackageManager({
  cliType,
  lockfileVersion,
  nodeVersion,
  env,
}: {
  cliType: CliType;
  lockfileVersion: number | undefined;
  nodeVersion: NodeVersion | undefined;
  env: { [x: string]: string | undefined };
}): {
  /**
   * Which lockfile was detected.
   */
  detectedLockfile: string | undefined;
  /**
   * Detected package manager that generated the found lockfile.
   */
  detectedPackageManager: string | undefined;
  /**
   * Value of $PATH that includes the binaries for the detected package manager.
   * Undefined if no $PATH are necessary.
   */
  path: string | undefined;
  /**
   * Set if yarn was identified as package manager and `YARN_NODE_LINKER`
   * environment variable was not found on the input environment.
   */
  yarnNodeLinker: string | undefined;
} {
  // This is not the correct check for whether or not corepack is being used. For that, you'd have to check
  // the package.json's `packageManager` property. However, this deprecated function is keeping it's old,
  // broken behavior.
  const corepackEnabled = env.ENABLE_EXPERIMENTAL_COREPACK === '1';

  let overrides = getPathOverrideForPackageManager({
    cliType,
    lockfileVersion,
    corepackPackageManager: undefined,
    nodeVersion,
  });

  if (corepackEnabled) {
    // this is essentially always overriding the value of `override`, but that's what was happening
    // in this deprecated function before
    overrides = NO_OVERRIDE;
  }

  const alreadyInPath = (newPath: string) => {
    const oldPath = env.PATH ?? '';
    return oldPath.split(path.delimiter).includes(newPath);
  };

  switch (true) {
    case cliType === 'yarn' && !env.YARN_NODE_LINKER:
      return { ...overrides, yarnNodeLinker: 'node-modules' };
    case alreadyInPath(overrides.path ?? ''):
      return {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      };
    default:
      return { ...overrides, yarnNodeLinker: undefined };
  }
}

export async function runCustomInstallCommand({
  destPath,
  installCommand,
  nodeVersion,
  spawnOpts,
  projectCreatedAt,
}: {
  destPath: string;
  installCommand: string;
  nodeVersion: NodeVersion;
  spawnOpts?: SpawnOptions;
  projectCreatedAt?: number;
}) {
  console.log(`Running "install" command: \`${installCommand}\`...`);
  const {
    cliType,
    lockfileVersion,
    packageJson,
    packageJsonPackageManager,
    turboSupportsCorepackHome,
  } = await scanParentDirs(destPath, true);
  const env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    nodeVersion,
    env: spawnOpts?.env || {},
    packageJsonEngines: packageJson?.engines,
    turboSupportsCorepackHome,
    projectCreatedAt,
  });
  debug(`Running with $PATH:`, env?.PATH || '');
  await execCommand(installCommand, {
    ...spawnOpts,
    env,
    cwd: destPath,
  });
}

export async function runPackageJsonScript(
  destPath: string,
  scriptNames: string | Iterable<string>,
  spawnOpts?: SpawnOptions,
  projectCreatedAt?: number
) {
  assert(path.isAbsolute(destPath));

  const {
    packageJson,
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    turboSupportsCorepackHome,
  } = await scanParentDirs(destPath, true);
  const scriptName = getScriptName(
    packageJson,
    typeof scriptNames === 'string' ? [scriptNames] : scriptNames
  );
  if (!scriptName) return false;

  debug('Running user script...');
  const runScriptTime = Date.now();

  const opts: SpawnOptionsExtended = {
    cwd: destPath,
    ...spawnOpts,
    env: getEnvForPackageManager({
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      nodeVersion: undefined,
      env: cloneEnv(process.env, spawnOpts?.env),
      packageJsonEngines: packageJson?.engines,
      turboSupportsCorepackHome,
      projectCreatedAt,
    }),
  };

  if (cliType === 'npm') {
    opts.prettyCommand = `npm run ${scriptName}`;
  } else if (cliType === 'pnpm') {
    opts.prettyCommand = `pnpm run ${scriptName}`;
  } else if (cliType === 'bun') {
    opts.prettyCommand = `bun run ${scriptName}`;
  } else {
    opts.prettyCommand = `yarn run ${scriptName}`;
  }

  console.log(`Running "${opts.prettyCommand}"`);
  await spawnAsync(cliType, ['run', scriptName], opts);

  debug(`Script complete [${Date.now() - runScriptTime}ms]`);
  return true;
}

export async function runBundleInstall(
  destPath: string,
  args: string[] = [],
  spawnOpts?: SpawnOptions,
  meta?: Meta
) {
  if (meta && meta.isDev) {
    debug('Skipping dependency installation because dev mode is enabled');
    return;
  }

  assert(path.isAbsolute(destPath));
  const opts = { ...spawnOpts, cwd: destPath, prettyCommand: 'bundle install' };

  await spawnAsync('bundle', args.concat(['install']), opts);
}

export async function runPipInstall(
  destPath: string,
  args: string[] = [],
  spawnOpts?: SpawnOptions,
  meta?: Meta
) {
  if (meta && meta.isDev) {
    debug('Skipping dependency installation because dev mode is enabled');
    return;
  }

  assert(path.isAbsolute(destPath));
  const opts = { ...spawnOpts, cwd: destPath, prettyCommand: 'pip3 install' };

  await spawnAsync(
    'pip3',
    ['install', '--disable-pip-version-check', ...args],
    opts
  );
}

export function getScriptName(
  pkg: Pick<PackageJson, 'scripts'> | null | undefined,
  possibleNames: Iterable<string>
): string | undefined {
  if (pkg?.scripts) {
    for (const name of possibleNames) {
      if (name in pkg.scripts) {
        return name;
      }
    }
  }
  return undefined;
}

/**
 * @deprecate installDependencies() is deprecated.
 * Please use runNpmInstall() instead.
 */
export const installDependencies = deprecate(
  runNpmInstall,
  'installDependencies() is deprecated. Please use runNpmInstall() instead.'
);
