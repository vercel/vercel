import execa from 'execa';
import fs from 'fs';
import os from 'os';
import { join } from 'path';
import which from 'which';
import { Meta, debug } from '@vercel/build-utils';

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

async function getUserScriptsDir(pythonPath: string): Promise<string | null> {
  const code =
    `import sys, sysconfig; print(sysconfig.get_path('scripts', scheme=('nt_user' if sys.platform == 'win32' else 'posix_user')))`.replace(
      /\n/g,
      ' '
    );
  try {
    const { stdout } = await execa(pythonPath, ['-c', code]);
    return stdout.trim();
  } catch (err) {
    debug('Failed to resolve Python user scripts directory');
    return null;
  }
}

async function pipInstall(
  pipPath: string,
  pythonPath: string,
  workPath: string,
  args: string[]
) {
  const target = resolveVendorDir();
  // See: https://github.com/pypa/pip/issues/4222#issuecomment-417646535
  //
  // Disable installing to the Python user install directory, which is
  // the default behavior on Debian systems and causes error:
  //
  // distutils.errors.DistutilsOptionError: can't combine user with
  // prefix, exec_prefix/home, or install_(plat)base
  process.env.PIP_USER = '0';

  let uvBin: string | null = null;

  try {
    uvBin = await getUvBinaryOrInstall(pipPath, pythonPath);
  } catch (err) {
    console.log('Failed to install uv, falling back to pip');
    // fall through to pip
  }

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
    debug(`Running "${prettyUv}"...`);
    try {
      await execa(uvBin!, uvArgs, {
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
  debug(`Running "${pretty}"...`);
  try {
    await execa(pipPath, cmdArgs, {
      cwd: workPath,
    });
  } catch (err) {
    console.log(`Failed to run "${pretty}"`);
    throw err;
  }
}

async function maybeFindUvBin(pythonPath: string): Promise<string | null> {
  // If on PATH already, use it
  const found = which.sync('uv', { nothrow: true });
  if (found) {
    return found;
  }

  // Resolve uv location from Python's user scripts directory
  try {
    const scriptsDir = await getUserScriptsDir(pythonPath);
    const uvName = process.platform === 'win32' ? 'uv.exe' : 'uv';
    const candidates: string[] = [];
    if (scriptsDir) {
      candidates.push(join(scriptsDir, uvName));
    }
    // Common fallbacks
    if (process.platform !== 'win32') {
      candidates.push(join(os.homedir(), '.local', 'bin', 'uv'));
      candidates.push('/usr/local/bin/uv');
      candidates.push('/opt/homebrew/bin/uv');
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } catch (err) {
    debug('Failed to locate uv after pip install');
  }
  return null;
}

async function getUvBinaryOrInstall(
  pipPath: string,
  pythonPath: string
): Promise<string> {
  const uvBin = await maybeFindUvBin(pythonPath);
  if (uvBin) {
    console.log(`Using uv at "${uvBin}"`);
    return uvBin;
  }

  // Pip install uv
  try {
    console.log('Installing uv...');
    await execa(
      pipPath,
      [
        'install',
        '--disable-pip-version-check',
        '--no-cache-dir',
        '--user',
        'uv',
      ],
      { env: { ...process.env, PIP_USER: '1' } }
    );
  } catch (err) {
    throw new Error('Failed to install uv via pip');
  }

  const resolvedUvBin = await maybeFindUvBin(pythonPath);
  if (!resolvedUvBin) {
    throw new Error('Unable to resolve uv binary after pip install');
  }

  console.log(`Installed uv at "${resolvedUvBin}"`);
  return resolvedUvBin;
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
  await pipInstall(pipPath, pythonPath, workPath, [exact, ...args]);
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
  await pipInstall(pipPath, pythonPath, workPath, [
    '--upgrade',
    '-r',
    filePath,
    ...args,
  ]);
}
