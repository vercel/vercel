import execa from 'execa';
import fs from 'fs';
import os from 'os';
import { join } from 'path';
import which from 'which';
import { Meta, debug, getWriteableDirectory } from '@vercel/build-utils';

const makeDependencyCheckCode = (dependency: string) => `
from importlib import util
dep = '${dependency}'.replace('-', '_')
spec = util.find_spec(dep)
print(spec.origin)
`;

async function isInstalled(
  pythonPath: string,
  dependency: string,
  cwd: string
) {
  try {
    const { stdout } = await execa(
      pythonPath,
      ['-c', makeDependencyCheckCode(dependency)],
      {
        stdio: 'pipe',
        cwd,
        env: { ...process.env, PYTHONPATH: join(cwd, resolveVendorDir()) },
      }
    );
    return stdout.startsWith(cwd);
  } catch (err) {
    return false;
  }
}

const makeRequirementsCheckCode = (requirementsPath: string) => `
import distutils.text_file
import pkg_resources
from pkg_resources import DistributionNotFound, VersionConflict
dependencies = distutils.text_file.TextFile(filename='${requirementsPath}').readlines()
pkg_resources.require(dependencies)
`;

async function areRequirementsInstalled(
  pythonPath: string,
  requirementsPath: string,
  cwd: string
) {
  try {
    await execa(
      pythonPath,
      ['-c', makeRequirementsCheckCode(requirementsPath)],
      {
        stdio: 'pipe',
        cwd,
        env: { ...process.env, PYTHONPATH: join(cwd, resolveVendorDir()) },
      }
    );
    return true;
  } catch (err) {
    return false;
  }
}

export function resolveVendorDir() {
  const vendorDir = process.env.VERCEL_PYTHON_VENDOR_DIR || '_vendor';
  return vendorDir;
}

async function pipInstall(pipPath: string, workPath: string, args: string[]) {
  const target = resolveVendorDir();
  // See: https://github.com/pypa/pip/issues/4222#issuecomment-417646535
  //
  // Disable installing to the Python user install directory, which is
  // the default behavior on Debian systems and causes error:
  //
  // distutils.errors.DistutilsOptionError: can't combine user with
  // prefix, exec_prefix/home, or install_(plat)base
  process.env.PIP_USER = '0';
  // Prefer using `uv` if available; install it if missing.
  const uvBin = await getUvBinary();
  if (uvBin) {
    const uvArgs = [
      'pip',
      'install',
      '--no-compile',
      '--no-cache-dir',
      '--target',
      target,
      ...args,
    ];
    const prettyUv = `${uvBin} ${uvArgs.join(' ')}`;
    console.log(`Running "${prettyUv}"...`);
    try {
      await execa(uvBin, uvArgs, {
        cwd: workPath,
      });
      return;
    } catch (err) {
      console.log(`Failed to run "${prettyUv}", falling back to pip`);
      // fall through to pip
    }
  }

  const cmdArgs = [
    'install',
    '--disable-pip-version-check',
    '--no-compile',
    '--no-cache-dir',
    '--target',
    target,
    ...args,
  ];
  const pretty = `${pipPath} ${cmdArgs.join(' ')}`;
  console.log(`Running "${pretty}"...`);
  try {
    await execa(pipPath, cmdArgs, {
      cwd: workPath,
    });
  } catch (err) {
    console.log(`Failed to run "${pretty}"`);
    throw err;
  }
}

async function getUvBinary(): Promise<string | null> {
  // If on PATH already, use it
  try {
    const found = which.sync('uv', { nothrow: true });
    if (found) {
      return found;
    }
  } catch (err) {
    debug('uv binary not found on PATH via which.sync');
  }
  try {
    await execa('uv', ['--version']);
    return 'uv';
  } catch (err) {
    debug('uv command not runnable');
  }

  // Attempt to install into a temporary directory
  try {
    const tmpRoot = await getWriteableDirectory();
    const tmpBin = join(tmpRoot, 'uv-bin');
    try {
      await fs.promises.mkdir(tmpBin, { recursive: true });
    } catch (err) {
      debug('Failed to create tmp uv bin directory');
    }

    if (process.platform === 'win32') {
      // Windows PowerShell installer
      try {
        console.log('Installing uv...');
        await execa('powershell', [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          'iwr https://astral.sh/uv/install.ps1 -useb | iex',
        ]);
      } catch (err) {
        debug('uv PowerShell install failed');
      }
      const candidates = [
        join(
          process.env.USERPROFILE || os.homedir(),
          '.local',
          'bin',
          'uv.exe'
        ),
        join(
          process.env.USERPROFILE || os.homedir(),
          '.cargo',
          'bin',
          'uv.exe'
        ),
        join(tmpBin, 'uv.exe'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
      return null;
    } else {
      // POSIX installer with preferred custom path; fallback to default path
      console.log('Installing uv...');
      const installWithPath = `curl -LsSf https://astral.sh/uv/install.sh | sh -s -- --path "${tmpBin}"`;
      try {
        await execa('sh', ['-c', installWithPath], { cwd: tmpBin });
      } catch (err) {
        debug('uv POSIX install with custom path failed');
      }

      const posixCandidates = [
        join(tmpBin, 'uv'),
        join(tmpBin, 'bin', 'uv'),
        join(os.homedir(), '.local', 'bin', 'uv'),
        '/usr/local/bin/uv',
        '/opt/homebrew/bin/uv',
      ];
      for (const p of posixCandidates) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
      debug('uv binary not found in any candidate paths');

      return null;
    }
  } catch (err) {
    debug('uv installation attempt failed');
    return null;
  }
}

interface InstallRequirementArg {
  pythonPath: string;
  pipPath: string;
  dependency: string;
  version: string;
  workPath: string;
  meta: Meta;
  args?: string[];
}

// note that any internal dependency that vc_init.py requires that's installed
// with this function can get overridden by a newer version from requirements.txt,
// so vc_init should do runtime version checks to be compatible with any recent
// version of its dependencies
export async function installRequirement({
  pythonPath,
  pipPath,
  dependency,
  version,
  workPath,
  meta,
  args = [],
}: InstallRequirementArg) {
  if (meta.isDev && (await isInstalled(pythonPath, dependency, workPath))) {
    debug(
      `Skipping ${dependency} dependency installation, already installed in ${workPath}`
    );
    return;
  }
  const exact = `${dependency}==${version}`;
  await pipInstall(pipPath, workPath, [exact, ...args]);
}

interface InstallRequirementsFileArg {
  pythonPath: string;
  pipPath: string;
  filePath: string;
  workPath: string;
  meta: Meta;
  args?: string[];
}

export async function installRequirementsFile({
  pythonPath,
  pipPath,
  filePath,
  workPath,
  meta,
  args = [],
}: InstallRequirementsFileArg) {
  // The Vercel platform already handles `requirements.txt` for frontend projects,
  // but the installation logic there is different, because it seems to install all
  // of the dependencies globally, whereas, for this Runtime, we want it to happen only
  // locally, so we'll run a separate installation.

  if (
    meta.isDev &&
    (await areRequirementsInstalled(pythonPath, filePath, workPath))
  ) {
    debug(`Skipping requirements file installation, already installed`);
    return;
  }
  await pipInstall(pipPath, workPath, ['--upgrade', '-r', filePath, ...args]);
}
