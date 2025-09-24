import execa from 'execa';
import fs from 'fs';
import os from 'os';
import { join } from 'path';
import which from 'which';
import { Meta, debug } from '@vercel/build-utils';

const isWin = process.platform === 'win32';
const uvExec = isWin ? 'uv.exe' : 'uv';

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

async function getGlobalScriptsDir(pythonPath: string): Promise<string | null> {
  const code = `import sysconfig; print(sysconfig.get_path('scripts'))`;
  try {
    const { stdout } = await execa(pythonPath, ['-c', code]);
    const out = stdout.trim();
    return out || null;
  } catch (err) {
    debug('Failed to resolve Python global scripts directory', err);
    return null;
  }
}

async function getUserScriptsDir(pythonPath: string): Promise<string | null> {
  const code =
    `import sys, sysconfig; print(sysconfig.get_path('scripts', scheme=('nt_user' if sys.platform == 'win32' else 'posix_user')))`.replace(
      /\n/g,
      ' '
    );
  try {
    const { stdout } = await execa(pythonPath, ['-c', code]);
    const out = stdout.trim();
    return out || null;
  } catch (err) {
    debug('Failed to resolve Python user scripts directory', err);
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
    uvBin = await getUvBinaryOrInstall(pythonPath);
  } catch (err) {
    console.log('Failed to install uv, falling back to pip');
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
      debug(`error: ${err}`);
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
    debug(`error: ${err}`);
    throw err;
  }
}

async function maybeFindUvBin(pythonPath: string): Promise<string | null> {
  // If on PATH already, use it
  const found = which.sync('uv', { nothrow: true });
  if (found) return found;

  // Interprerer's global/venv scripts dir
  try {
    const globalScriptsDir = await getGlobalScriptsDir(pythonPath);
    if (globalScriptsDir) {
      const uvPath = join(globalScriptsDir, uvExec);
      if (fs.existsSync(uvPath)) return uvPath;
    }
  } catch (err) {
    debug('Failed to resolve Python global scripts directory', err);
  }

  // Interpreter's user scripts dir
  try {
    const userScriptsDir = await getUserScriptsDir(pythonPath);
    if (userScriptsDir) {
      const uvPath = join(userScriptsDir, uvExec);
      if (fs.existsSync(uvPath)) return uvPath;
    }
  } catch (err) {
    debug('Failed to resolve Python user scripts directory', err);
  }

  // Common fallbacks
  try {
    const candidates: string[] = [];
    if (!isWin) {
      candidates.push(join(os.homedir(), '.local', 'bin', 'uv'));
      candidates.push('/usr/local/bin/uv');
      candidates.push('/opt/homebrew/bin/uv');
    } else {
      candidates.push('C:\\Users\\Public\\uv\\uv.exe');
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch (err) {
    debug('Failed to resolve uv fallback paths', err);
  }

  return null;
}

async function getUvBinaryOrInstall(pythonPath: string): Promise<string> {
  const uvBin = await maybeFindUvBin(pythonPath);
  if (uvBin) {
    console.log(`Using uv at "${uvBin}"`);
    return uvBin;
  }

  // Pip install uv
  // Note we're using pip directly instead of pipPath because we want to make sure
  // it is installed in the same environment as the Python interpreter
  try {
    console.log('Installing uv...');
    await execa(
      pythonPath,
      [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-cache-dir',
        '--user',
        'uv==0.8.18',
      ],
      { env: { ...process.env, PIP_USER: '1' } }
    );
  } catch (err) {
    throw new Error(
      `Failed to install uv via pip: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
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

export async function exportRequirementsFromUv(
  pythonPath: string,
  projectDir: string,
  options: { locked?: boolean } = {}
): Promise<string> {
  const { locked = false } = options;
  const uvBin = await getUvBinaryOrInstall(pythonPath);
  const args: string[] = ['export'];
  // Prefer using the lockfile strictly if present
  if (locked) {
    // "--frozen" ensures the lock is respected and not updated during export
    args.push('--frozen');
  }
  debug(`Running "${uvBin} ${args.join(' ')}" in ${projectDir}...`);
  let stdout: string;
  try {
    const { stdout: out } = await execa(uvBin, args, { cwd: projectDir });
    stdout = out;
  } catch (err) {
    throw new Error(
      `Failed to run "${uvBin} ${args.join(' ')}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  const tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'vercel-uv-'));
  const outPath = join(tmpDir, 'requirements.uv.txt');
  await fs.promises.writeFile(outPath, stdout);
  debug(`Exported requirements to ${outPath}`);
  return outPath;
}

export async function exportRequirementsFromPipfile({
  pythonPath,
  pipPath,
  projectDir,
  meta,
}: {
  pythonPath: string;
  pipPath: string;
  projectDir: string;
  meta: Meta;
}): Promise<string> {
  // Install pipfile-requirements into a temp vendor dir, then run pipfile2req
  const tempDir = await fs.promises.mkdtemp(
    join(os.tmpdir(), 'vercel-pipenv-')
  );
  await installRequirement({
    pythonPath,
    pipPath,
    dependency: 'pipfile-requirements',
    version: '0.3.0',
    workPath: tempDir,
    meta,
    args: ['--no-warn-script-location'],
  });

  const tempVendorDir = join(tempDir, resolveVendorDir());
  const convertCmd = isWin
    ? join(tempVendorDir, 'Scripts', 'pipfile2req.exe')
    : join(tempVendorDir, 'bin', 'pipfile2req');

  debug(`Running "${convertCmd}" in ${projectDir}...`);
  let stdout: string;
  try {
    const { stdout: out } = await execa(convertCmd, [], {
      cwd: projectDir,
      env: { ...process.env, PYTHONPATH: tempVendorDir },
    });
    stdout = out;
  } catch (err) {
    throw new Error(
      `Failed to run "${convertCmd}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const outPath = join(tempDir, 'requirements.pipenv.txt');
  await fs.promises.writeFile(outPath, stdout);
  debug(`Exported pipfile requirements to ${outPath}`);
  return outPath;
}
