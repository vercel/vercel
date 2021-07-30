import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import debug from '../debug';
import spawn from 'cross-spawn';
import { SpawnOptions } from 'child_process';
import { deprecate } from 'util';
import { NowBuildError } from '../errors';
import { Meta, PackageJson, NodeVersion, Config } from '../types';
import { getSupportedNodeVersion, getLatestNodeVersion } from './node-version';

export type CliType = 'yarn' | 'npm';

export interface ScanParentDirsResult {
  /**
   * "yarn" or "npm", depending on the presence of lockfiles.
   */
  cliType: CliType;
  /**
   * The contents of found `package.json` file, when the `readPackageJson`
   * option is enabled.
   */
  packageJson?: PackageJson;
  /**
   * The `lockfileVersion` number from the `package-lock.json` file,
   * when present.
   */
  lockfileVersion?: number;
}

export interface WalkParentDirsProps {
  /**
   * The highest directory, typically the workPath root of the project.
   * If this directory is reached and it doesn't contain the file, null is returned.
   */
  base: string;
  /**
   * The directory to start searching, typically the same directory of the entrypoint.
   * If this directory doesn't contain the file, the parent is checked, etc.
   */
  start: string;
  /**
   * The name of the file to search for, typically `package.json` or `Gemfile`.
   */
  filename: string;
}

export interface SpawnOptionsExtended extends SpawnOptions {
  /**
   * Pretty formatted command that is being spawned for logging purposes.
   */
  prettyCommand?: string;
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
      if (code === 0) {
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

export function execAsync(
  command: string,
  args: string[],
  opts: SpawnOptionsExtended = {}
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve, reject) => {
      opts.stdio = 'pipe';

      const stdoutList: Buffer[] = [];
      const stderrList: Buffer[] = [];

      const child = spawn(command, args, opts);

      child.stderr!.on('data', data => {
        stderrList.push(data);
      });

      child.stdout!.on('data', data => {
        stdoutList.push(data);
      });

      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code !== 0) {
          const cmd = opts.prettyCommand
            ? `Command "${opts.prettyCommand}"`
            : 'Command';

          return reject(
            new NowBuildError({
              code: `BUILD_UTILS_EXEC_${code || signal}`,
              message: `${cmd} exited with ${code || signal}`,
            })
          );
        }

        return resolve({
          code,
          stdout: Buffer.concat(stdoutList).toString(),
          stderr: Buffer.concat(stderrList).toString(),
        });
      });
    }
  );
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

export async function getNodeBinPath({ cwd }: { cwd: string }) {
  const { stdout } = await execAsync('npm', ['bin'], { cwd });
  return stdout.trim();
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
    env: { ...process.env },
  };

  if (!meta.isDev) {
    // Ensure that the selected Node version is at the beginning of the `$PATH`
    opts.env.PATH = `/node${nodeVersion.major}/bin:${opts.env.PATH}`;
  }

  return opts;
}

export async function getNodeVersion(
  destPath: string,
  _nodeVersion?: string,
  config: Config = {},
  meta: Meta = {}
): Promise<NodeVersion> {
  if (meta && meta.isDev) {
    // Use the system-installed version of `node` in PATH for `vercel dev`
    const latest = getLatestNodeVersion();
    return { ...latest, runtime: 'nodejs' };
  }
  const { packageJson } = await scanParentDirs(destPath, true);
  let { nodeVersion } = config;
  let isAuto = true;
  if (packageJson && packageJson.engines && packageJson.engines.node) {
    const { node } = packageJson.engines;
    if (nodeVersion && nodeVersion !== node && !meta.isDev) {
      console.warn(
        `Warning: Due to "engines": { "node": "${node}" } in your \`package.json\` file, the Node.js Version defined in your Project Settings ("${nodeVersion}") will not apply. Learn More: http://vercel.link/node-version`
      );
    }
    nodeVersion = node;
    isAuto = false;
  }
  return getSupportedNodeVersion(nodeVersion, isAuto);
}

async function scanParentDirs(
  destPath: string,
  readPackageJson = false
): Promise<ScanParentDirsResult> {
  assert(path.isAbsolute(destPath));

  let cliType: CliType = 'yarn';
  let packageJson: PackageJson | undefined;
  let currentDestPath = destPath;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const packageJsonPath = path.join(currentDestPath, 'package.json');
    // eslint-disable-next-line no-await-in-loop
    if (await fs.pathExists(packageJsonPath)) {
      // eslint-disable-next-line no-await-in-loop
      if (readPackageJson) {
        packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      }
      // eslint-disable-next-line no-await-in-loop
      const [hasPackageLockJson, hasYarnLock] = await Promise.all([
        fs.pathExists(path.join(currentDestPath, 'package-lock.json')),
        fs.pathExists(path.join(currentDestPath, 'yarn.lock')),
      ]);
      if (hasPackageLockJson && !hasYarnLock) {
        cliType = 'npm';
      }
      break;
    }

    const newDestPath = path.dirname(currentDestPath);
    if (currentDestPath === newDestPath) break;
    currentDestPath = newDestPath;
  }

  return { cliType, packageJson };
}

export async function walkParentDirs({
  base,
  start,
  filename,
}: WalkParentDirsProps): Promise<string | null> {
  assert(path.isAbsolute(base), 'Expected "base" to be absolute path');
  assert(path.isAbsolute(start), 'Expected "start" to be absolute path');
  let parent = '';

  for (let current = start; base.length <= current.length; current = parent) {
    const fullPath = path.join(current, filename);

    // eslint-disable-next-line no-await-in-loop
    if (await fs.pathExists(fullPath)) {
      return fullPath;
    }

    parent = path.dirname(current);
  }

  return null;
}

export async function runNpmInstall(
  destPath: string,
  args: string[] = [],
  spawnOpts?: SpawnOptions,
  meta?: Meta
) {
  if (meta?.isDev) {
    debug('Skipping dependency installation because dev mode is enabled');
    return;
  }

  assert(path.isAbsolute(destPath));
  debug(`Installing to ${destPath}`);

  const { cliType, lockfileVersion } = await scanParentDirs(destPath);
  const opts: SpawnOptionsExtended = { cwd: destPath, ...spawnOpts };
  const env = opts.env ? { ...opts.env } : { ...process.env };
  delete env.NODE_ENV;
  opts.env = env;

  let command: CliType;
  let commandArgs: string[];

  if (cliType === 'npm') {
    opts.prettyCommand = 'npm install';
    command = 'npm';
    commandArgs = args
      .filter(a => a !== '--prefer-offline')
      .concat(['install', '--no-audit', '--unsafe-perm']);

    if (lockfileVersion === 2) {
      // Ensure that npm 7 is at the beginning of the `$PATH`
      env.PATH = `/node16/bin:${env.PATH}`;
    }
  } else {
    opts.prettyCommand = 'yarn install';
    command = 'yarn';
    commandArgs = ['install', ...args];

    // Yarn v2 PnP mode may be activated, so force "node-modules" linker style
    if (!env.YARN_NODE_LINKER) {
      env.YARN_NODE_LINKER = 'node-modules';
    }
  }

  if (process.env.NPM_ONLY_PRODUCTION) {
    commandArgs.push('--production');
  }
  await spawnAsync(command, commandArgs, opts);
}

export async function runPackageJsonScript(
  destPath: string,
  scriptNames: string | Iterable<string>,
  spawnOpts?: SpawnOptions
) {
  assert(path.isAbsolute(destPath));

  let command: CliType;
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

  const opts: SpawnOptionsExtended = { cwd: destPath, ...spawnOpts };
  const env: typeof process.env = { ...process.env, ...opts.env };
  delete env.NODE_ENV;
  opts.env = env;

  if (cliType === 'npm') {
    opts.prettyCommand = `npm run ${scriptName}`;
    command = 'npm';

    if (lockfileVersion === 2) {
      // Ensure that npm 7 is at the beginning of the `$PATH`
      env.PATH = `/node16/bin:${env.PATH}`;
    }
  } else {
    opts.prettyCommand = `yarn run ${scriptName}`;
    command = 'yarn';

    // Yarn v2 PnP mode may be activated, so force "node-modules" linker style
    if (!env.YARN_NODE_LINKER) {
      env.YARN_NODE_LINKER = 'node-modules';
    }
  }

  console.log(`Running "${opts.prettyCommand}"`);
  await spawnAsync(command, ['run', scriptName], opts);

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
    debug('Skipping dependency installation because dev mode is enabled');
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
  if (pkg && pkg.scripts) {
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
