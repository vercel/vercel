import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import spawn from 'cross-spawn';
import { SpawnOptions } from 'child_process';
import { deprecate } from 'util';
import { Meta, PackageJson, NodeVersion, Config } from '../types';
import { getSupportedNodeVersion } from './node-version';

function spawnAsync(
  command: string,
  args: string[],
  cwd: string,
  opts: SpawnOptions = {}
) {
  return new Promise<void>((resolve, reject) => {
    const stderrLogs: Buffer[] = [];
    opts = { stdio: 'inherit', cwd, ...opts };
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
  await spawnAsync(`./${path.basename(fsPath)}`, args, destPath, spawnOpts);
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
  spawnOpts?: SpawnOptions
) {
  assert(path.isAbsolute(destPath));

  let commandArgs = args;
  console.log(`installing to ${destPath}`);
  const { hasPackageLockJson } = await scanParentDirs(destPath);

  const opts = spawnOpts || { env: process.env };

  if (hasPackageLockJson) {
    commandArgs = args.filter(a => a !== '--prefer-offline');
    await spawnAsync(
      'npm',
      commandArgs.concat(['install', '--unsafe-perm']),
      destPath,
      opts
    );
  } else {
    await spawnAsync(
      'yarn',
      commandArgs.concat(['--ignore-engines', '--cwd', destPath]),
      destPath,
      opts
    );
  }
}

export async function runPackageJsonScript(
  destPath: string,
  scriptName: string,
  opts?: SpawnOptions
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

  if (hasPackageLockJson) {
    console.log(`running "npm run ${scriptName}"`);
    await spawnAsync('npm', ['run', scriptName], destPath, opts);
  } else {
    console.log(`running "yarn run ${scriptName}"`);
    await spawnAsync(
      'yarn',
      ['--cwd', destPath, 'run', scriptName],
      destPath,
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
