import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import Sema from 'async-sema';
import spawn from 'cross-spawn';
import { coerce, intersects, validRange } from 'semver';
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

// Only allow one `runNpmInstall()` invocation to run concurrently
const runNpmInstallSema = new Sema(1);

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
  nodeVersionFallback = process.env.VERCEL_PROJECT_SETTINGS_NODE_VERSION,
  config: Config = {},
  meta: Meta = {},
  availableVersions = getAvailableNodeVersions()
): Promise<NodeVersion> {
  const latest = getLatestNodeVersion(availableVersions);
  if (meta.isDev) {
    // Use the system-installed version of `node` in PATH for `vercel dev`
    return { ...latest, runtime: 'nodejs' };
  }
  const { packageJson } = await scanParentDirs(destPath, true);
  let nodeVersion = config.nodeVersion || nodeVersionFallback;
  let isAuto = true;
  if (packageJson?.engines?.node) {
    const { node } = packageJson.engines;
    if (nodeVersion && validRange(node) && !intersects(nodeVersion, node)) {
      console.warn(
        `Warning: Due to "engines": { "node": "${node}" } in your \`package.json\` file, the Node.js Version defined in your Project Settings ("${nodeVersion}") will not apply. Learn More: http://vercel.link/node-version`
      );
    } else if (coerce(node)?.raw === node) {
      console.warn(
        `Warning: Detected "engines": { "node": "${node}" } in your \`package.json\` with major.minor.patch, but only major Node.js Version can be selected. Learn More: http://vercel.link/node-version`
      );
    } else if (validRange(node) && intersects(`${latest.major + 1}.x`, node)) {
      console.warn(
        `Warning: Detected "engines": { "node": "${node}" } in your \`package.json\` that will automatically upgrade when a new major Node.js Version is released. Learn More: http://vercel.link/node-version`
      );
    }
    nodeVersion = node;
    isAuto = false;
  }
  return getSupportedNodeVersion(nodeVersion, isAuto, availableVersions);
}

export async function scanParentDirs(
  destPath: string,
  readPackageJson = false
): Promise<ScanParentDirsResult> {
  assert(path.isAbsolute(destPath));

  const pkgJsonPath = await walkParentDirs({
    base: '/',
    start: destPath,
    filename: 'package.json',
  });
  const packageJson: PackageJson | undefined =
    readPackageJson && pkgJsonPath
      ? JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'))
      : undefined;
  const [yarnLockPath, npmLockPath, pnpmLockPath, bunLockPath] =
    await walkParentDirsMulti({
      base: '/',
      start: destPath,
      filenames: [
        'yarn.lock',
        'package-lock.json',
        'pnpm-lock.yaml',
        'bun.lockb',
      ],
    });
  let lockfilePath: string | undefined;
  let lockfileVersion: number | undefined;
  let cliType: CliType;

  const [hasYarnLock, packageLockJson, pnpmLockYaml, bunLockBin] =
    await Promise.all([
      Boolean(yarnLockPath),
      npmLockPath
        ? readConfigFile<{ lockfileVersion: number }>(npmLockPath)
        : null,
      pnpmLockPath
        ? readConfigFile<{ lockfileVersion: number }>(pnpmLockPath)
        : null,
      bunLockPath ? fs.readFile(bunLockPath, 'utf8') : null,
    ]);

  // Priority order is bun > yarn > pnpm > npm
  // If no lockfile is detected, then npm is used.
  if (bunLockBin) {
    cliType = 'bun';
    lockfilePath = bunLockPath;
    // TODO: read "bun-lockfile-format-v0"
    lockfileVersion = 0;
  } else if (hasYarnLock) {
    cliType = 'yarn';
    lockfilePath = yarnLockPath;
  } else if (pnpmLockYaml) {
    cliType = 'pnpm';
    lockfilePath = pnpmLockPath;
    lockfileVersion = Number(pnpmLockYaml.lockfileVersion);
  } else if (packageLockJson) {
    cliType = 'npm';
    lockfilePath = npmLockPath;
    lockfileVersion = packageLockJson.lockfileVersion;
  } else {
    cliType = 'npm';
  }

  const packageJsonPath = pkgJsonPath || undefined;
  return {
    cliType,
    packageJson,
    lockfilePath,
    lockfileVersion,
    packageJsonPath,
  };
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
}: WalkParentDirsMultiProps): Promise<(string | undefined)[]> {
  for (const dir of traverseUpDirectories({ start, base })) {
    const fullPaths = filenames.map(f => path.join(dir, f));
    const existResults = await Promise.all(
      fullPaths.map(f => fs.pathExists(f))
    );
    const foundOneOrMore = existResults.some(b => b);

    if (foundOneOrMore) {
      return fullPaths.map((f, i) => (existResults[i] ? f : undefined));
    }
  }

  return [];
}

function isSet<T>(v: any): v is Set<T> {
  return v?.constructor?.name === 'Set';
}

export async function runNpmInstall(
  destPath: string,
  args: string[] = [],
  spawnOpts?: SpawnOptions,
  meta?: Meta,
  nodeVersion?: NodeVersion
): Promise<boolean> {
  if (meta?.isDev) {
    debug('Skipping dependency installation because dev mode is enabled');
    return false;
  }

  assert(path.isAbsolute(destPath));

  try {
    await runNpmInstallSema.acquire();
    const { cliType, packageJsonPath, lockfileVersion } = await scanParentDirs(
      destPath
    );

    if (!packageJsonPath) {
      debug(
        'Skipping dependency installation because no `package.json` was found'
      );
      runNpmInstallSema.release();
      return false;
    }

    // Only allow `runNpmInstall()` to run once per `package.json`
    // when doing a default install (no additional args)
    if (meta && packageJsonPath && args.length === 0) {
      if (!isSet<string>(meta.runNpmInstallSet)) {
        meta.runNpmInstallSet = new Set<string>();
      }
      if (isSet<string>(meta.runNpmInstallSet)) {
        if (meta.runNpmInstallSet.has(packageJsonPath)) {
          return false;
        } else {
          meta.runNpmInstallSet.add(packageJsonPath);
        }
      }
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
      nodeVersion,
      env,
    });
    let commandArgs: string[];
    const isPotentiallyBrokenNpm =
      cliType === 'npm' &&
      (nodeVersion?.major === 16 ||
        opts.env.PATH?.includes('/node16/bin-npm7')) &&
      !args.includes('--legacy-peer-deps') &&
      spawnOpts?.env?.ENABLE_EXPERIMENTAL_COREPACK !== '1';

    if (cliType === 'npm') {
      opts.prettyCommand = 'npm install';
      commandArgs = args
        .filter(a => a !== '--prefer-offline')
        .concat(['install', '--no-audit', '--unsafe-perm']);
      if (
        isPotentiallyBrokenNpm &&
        spawnOpts?.env?.VERCEL_NPM_LEGACY_PEER_DEPS === '1'
      ) {
        // Starting in npm@8.6.0, if you ran `npm install --legacy-peer-deps`,
        // and then later ran `npm install`, it would fail. So the only way
        // to safely upgrade npm from npm@8.5.0 is to set this flag. The docs
        // say this flag is not recommended so its is behind a feature flag
        // so we can remove it in node@18, which can introduce breaking changes.
        // See https://docs.npmjs.com/cli/v8/using-npm/config#legacy-peer-deps
        commandArgs.push('--legacy-peer-deps');
      }
    } else if (cliType === 'pnpm') {
      // PNPM's install command is similar to NPM's but without the audit nonsense
      // @see options https://pnpm.io/cli/install
      opts.prettyCommand = 'pnpm install';
      commandArgs = args
        .filter(a => a !== '--prefer-offline')
        .concat(['install', '--unsafe-perm']);
    } else if (cliType === 'bun') {
      // @see options https://bun.sh/docs/cli/install
      opts.prettyCommand = 'bun install';
      commandArgs = ['install', ...args];
    } else {
      opts.prettyCommand = 'yarn install';
      commandArgs = ['install', ...args];
    }

    if (process.env.NPM_ONLY_PRODUCTION) {
      commandArgs.push('--production');
    }

    try {
      await spawnAsync(cliType, commandArgs, opts);
    } catch (err: unknown) {
      const potentialErrorPath = path.join(
        process.env.HOME || '/',
        '.npm',
        'eresolve-report.txt'
      );
      if (
        isPotentiallyBrokenNpm &&
        !commandArgs.includes('--legacy-peer-deps') &&
        fs.existsSync(potentialErrorPath)
      ) {
        console.warn(
          'Warning: Retrying "Install Command" with `--legacy-peer-deps` which may accept a potentially broken dependency and slow install time.'
        );
        commandArgs.push('--legacy-peer-deps');
        await spawnAsync(cliType, commandArgs, opts);
      } else {
        throw err;
      }
    }
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
  nodeVersion,
  env,
}: {
  cliType: CliType;
  lockfileVersion: number | undefined;
  nodeVersion: NodeVersion | undefined;
  env: { [x: string]: string | undefined };
}) {
  const {
    detectedLockfile,
    detectedPackageManager,
    path: newPath,
    yarnNodeLinker,
  } = getPathForPackageManager({
    cliType,
    lockfileVersion,
    nodeVersion,
    env,
  });

  const newEnv: { [x: string]: string | undefined } = {
    ...env,
  };

  if (newPath) {
    // Ensure that the binaries of the detected package manager are at the
    // beginning of the `$PATH`.
    const oldPath = env.PATH + '';
    newEnv.PATH = `${newPath}${path.delimiter}${oldPath}`;
  }

  if (yarnNodeLinker) {
    newEnv.YARN_NODE_LINKER = yarnNodeLinker;
  }

  if (detectedLockfile && detectedPackageManager) {
    // For pnpm we also show the version of the lockfile we found
    const versionString =
      cliType === 'pnpm' ? `version ${lockfileVersion} ` : '';

    console.log(
      `Detected \`${detectedLockfile}\` ${versionString}generated by ${detectedPackageManager}`
    );

    if (cliType === 'bun') {
      console.warn(
        'Warning: Bun is used as a package manager at build time only, not at runtime with Functions'
      );
    }
  }

  return newEnv;
}

/**
 * Helper to get the binary paths that link to the used package manager.
 * Note: Make sure it doesn't contain any `console.log` calls.
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
  let detectedLockfile: string | undefined;
  let detectedPackageManager: string | undefined;
  let pathValue: string | undefined;
  let yarnNodeLinker: string | undefined;
  const oldPath = env.PATH + '';
  const npm7 = '/node16/bin-npm7';
  const pnpm7 = '/pnpm7/node_modules/.bin';
  const pnpm8 = '/pnpm8/node_modules/.bin';
  const bun1 = '/bun1';
  const corepackEnabled = env.ENABLE_EXPERIMENTAL_COREPACK === '1';
  if (cliType === 'npm') {
    if (
      typeof lockfileVersion === 'number' &&
      lockfileVersion >= 2 &&
      (nodeVersion?.major || 0) < 16 &&
      !oldPath.includes(npm7) &&
      !corepackEnabled
    ) {
      // npm 7
      pathValue = npm7;
      detectedLockfile = 'package-lock.json';
      detectedPackageManager = 'npm 7+';
    }
  } else if (cliType === 'pnpm') {
    if (
      typeof lockfileVersion === 'number' &&
      lockfileVersion === 5.4 &&
      !oldPath.includes(pnpm7) &&
      !corepackEnabled
    ) {
      // pnpm 7
      pathValue = pnpm7;
      detectedLockfile = 'pnpm-lock.yaml';
      detectedPackageManager = 'pnpm 7';
    } else if (
      typeof lockfileVersion === 'number' &&
      lockfileVersion >= 6 &&
      !oldPath.includes(pnpm8) &&
      !corepackEnabled
    ) {
      // pnpm 8
      pathValue = pnpm8;
      detectedLockfile = 'pnpm-lock.yaml';
      detectedPackageManager = 'pnpm 8';
    }
  } else if (cliType === 'bun') {
    if (!oldPath.includes(bun1) && !corepackEnabled) {
      // Bun 1
      pathValue = bun1;
      detectedLockfile = 'bun.lockb';
      detectedPackageManager = 'Bun';
    }
  } else {
    // Yarn v2 PnP mode may be activated, so force "node-modules" linker style
    if (!env.YARN_NODE_LINKER) {
      yarnNodeLinker = 'node-modules';
    }
  }
  return {
    detectedLockfile,
    detectedPackageManager,
    path: pathValue,
    yarnNodeLinker,
  };
}

export async function runCustomInstallCommand({
  destPath,
  installCommand,
  nodeVersion,
  spawnOpts,
}: {
  destPath: string;
  installCommand: string;
  nodeVersion: NodeVersion;
  spawnOpts?: SpawnOptions;
}) {
  console.log(`Running "install" command: \`${installCommand}\`...`);
  const { cliType, lockfileVersion } = await scanParentDirs(destPath);
  const env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    nodeVersion,
    env: spawnOpts?.env || {},
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
  spawnOpts?: SpawnOptions
) {
  assert(path.isAbsolute(destPath));

  const { packageJson, cliType, lockfileVersion } = await scanParentDirs(
    destPath,
    true
  );
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
      nodeVersion: undefined,
      env: cloneEnv(process.env, spawnOpts?.env),
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
): string | null {
  if (pkg?.scripts) {
    for (const name of possibleNames) {
      if (name in pkg.scripts) {
        return name;
      }
    }
  }
  return null;
}

/**
 * @deprecate installDependencies() is deprecated.
 * Please use runNpmInstall() instead.
 */
export const installDependencies = deprecate(
  runNpmInstall,
  'installDependencies() is deprecated. Please use runNpmInstall() instead.'
);
