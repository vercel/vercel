import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import debug from '../debug';
import spawn from 'cross-spawn';
import { SpawnOptions } from 'child_process';
import { deprecate } from 'util';
import { cpus } from 'os';
import { Meta, PackageJson, NodeVersion, Config } from '../types';
import { getSupportedNodeVersion } from './node-version';

export function spawnAsync(
  command: string,
  args: string[],
  opts: SpawnOptions = {}
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

      const errorLogs = stderrLogs.map(line => line.toString()).join('');
      if (opts.stdio !== 'inherit') {
        reject(new Error(`Exited with ${code || signal}\n${errorLogs}`));
      } else {
        reject(new Error(`Exited with ${code || signal}`));
      }
    });
  });
}

export function execAsync(
  command: string,
  args: string[],
  opts: SpawnOptions = {}
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve, reject) => {
      opts.stdio = 'pipe';

      let stdout: Buffer = Buffer.from('');
      let stderr: Buffer = Buffer.from('');

      const child = spawn(command, args, opts);

      child.stderr!.on('data', data => {
        stderr = Buffer.concat([stderr, data]);
      });

      child.stdout!.on('data', data => {
        stdout = Buffer.concat([stdout, data]);
      });

      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code !== 0) {
          return reject(
            new Error(
              `Program "${command}" exited with non-zero exit code ${code} ${signal}.`
            )
          );
        }

        return resolve({
          code,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    }
  );
}

export function spawnCommand(command: string, options: SpawnOptions = {}) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/C', command], options);
  }

  return spawn('sh', ['-c', command], options);
}

export async function execCommand(command: string, options: SpawnOptions = {}) {
  if (process.platform === 'win32') {
    await spawnAsync('cmd.exe', ['/C', command], options);
  } else {
    await spawnAsync('sh', ['-c', command], options);
  }

  return true;
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
  await spawnAsync(`./${path.basename(fsPath)}`, args, {
    cwd: destPath,
    ...spawnOpts,
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
    opts.env.PATH = `/node${nodeVersion.major}/bin:${opts.env.PATH}`;
  }

  return opts;
}

export async function getNodeVersion(
  destPath: string,
  minNodeVersion?: string,
  config?: Config
): Promise<NodeVersion> {
  const { packageJson } = await scanParentDirs(destPath, true);
  let range: string | undefined;
  let silent = false;
  if (packageJson && packageJson.engines && packageJson.engines.node) {
    range = packageJson.engines.node;
  } else if (minNodeVersion) {
    range = minNodeVersion;
    silent = true;
  } else if (config && config.zeroConfig) {
    // Use latest node version zero config detected
    range = '10.x';
    silent = true;
  }
  return getSupportedNodeVersion(range, silent);
}

async function scanParentDirs(destPath: string, readPackageJson = false) {
  assert(path.isAbsolute(destPath));

  let hasPackageLockJson = false;
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
      hasPackageLockJson = await fs.pathExists(
        path.join(currentDestPath, 'package-lock.json')
      );
      break;
    }

    const newDestPath = path.dirname(currentDestPath);
    if (currentDestPath === newDestPath) break;
    currentDestPath = newDestPath;
  }

  return { hasPackageLockJson, packageJson };
}

export async function runNpmInstall(
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

  let commandArgs = args;
  debug(`Installing to ${destPath}`);
  const { hasPackageLockJson } = await scanParentDirs(destPath);

  const opts = { cwd: destPath, ...spawnOpts } || {
    cwd: destPath,
    env: process.env,
  };

  if (hasPackageLockJson) {
    commandArgs = args.filter(a => a !== '--prefer-offline');
    await spawnAsync(
      'npm',
      commandArgs.concat(['install', '--no-audit', '--unsafe-perm']),
      opts
    );
  } else {
    await spawnAsync(
      'yarn',
      commandArgs.concat(['--ignore-engines', '--cwd', destPath]),
      opts
    );
  }
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
  const opts = { cwd: destPath, ...spawnOpts } || {
    cwd: destPath,
    env: process.env,
  };

  await spawnAsync(
    'bundle',
    args.concat([
      'install',
      '--no-prune',
      '--retry',
      '3',
      '--jobs',
      String(cpus().length || 1),
    ]),
    opts
  );
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
  const opts = { cwd: destPath, ...spawnOpts } || {
    cwd: destPath,
    env: process.env,
  };

  await spawnAsync(
    'pip3',
    ['install', '--disable-pip-version-check', ...args],
    opts
  );
}

export async function runPackageJsonScript(
  destPath: string,
  scriptName: string,
  spawnOpts?: SpawnOptions
) {
  assert(path.isAbsolute(destPath));
  const { packageJson, hasPackageLockJson } = await scanParentDirs(
    destPath,
    true
  );
  const hasScript = Boolean(
    packageJson &&
      packageJson.scripts &&
      scriptName &&
      packageJson.scripts[scriptName]
  );
  if (!hasScript) return false;

  const opts = { cwd: destPath, ...spawnOpts };

  if (hasPackageLockJson) {
    console.log(`Running "npm run ${scriptName}"`);
    await spawnAsync('npm', ['run', scriptName], opts);
  } else {
    console.log(`Running "yarn run ${scriptName}"`);
    await spawnAsync(
      'yarn',
      ['--ignore-engines', '--cwd', destPath, 'run', scriptName],
      opts
    );
  }

  return true;
}

/**
 * @deprecate installDependencies() is deprecated.
 * Please use runNpmInstall() instead.
 */
export const installDependencies = deprecate(
  runNpmInstall,
  'installDependencies() is deprecated. Please use runNpmInstall() instead.'
);
