import execa from 'execa';
import fs from 'fs';
import os from 'os';
import { join, dirname, resolve } from 'path';
import {
  FileFsRef,
  Files,
  Meta,
  debug,
  glob,
  readConfigFile,
  traverseUpDirectories,
} from '@vercel/build-utils';
import { getVenvPythonBin, findDir } from './utils';
import { UvRunner, filterUnsafeUvPipArgs, getProtectedUvEnv } from './uv';
import { DEFAULT_PYTHON_VERSION } from './version';

const isWin = process.platform === 'win32';

const makeDependencyCheckCode = (dependency: string) => `
from importlib import util
dep = '${dependency}'.replace('-', '_')
spec = util.find_spec(dep)
print(spec.origin)
`;

export async function isInstalled(
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

async function getSitePackagesDirs(pythonBin: string): Promise<string[]> {
  // Ask the venv’s interpreter which directories it adds to sys.path for pure
  // Python packages and platform-specific packages so we mirror the exact same
  // paths when mounting `_vendor` in the Lambda bundle.
  const code = `
import json
import sysconfig
paths = []
for key in ("purelib", "platlib"):
    candidate = sysconfig.get_path(key)
    if candidate and candidate not in paths:
        paths.append(candidate)
print(json.dumps(paths))
`.trim();
  const { stdout } = await execa(pythonBin, ['-c', code]);
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      return parsed.filter((p): p is string => typeof p === 'string');
    }
  } catch (err) {
    debug('Failed to parse site-packages output', err);
  }
  return [];
}

export async function getVenvSitePackagesDirs(
  venvPath: string
): Promise<string[]> {
  const pythonBin = getVenvPythonBin(venvPath);
  return getSitePackagesDirs(pythonBin);
}

export function resolveVendorDir() {
  const vendorDir = process.env.VERCEL_PYTHON_VENDOR_DIR || '_vendor';
  return vendorDir;
}

export type ManifestType =
  | 'uv.lock'
  | 'pyproject.toml'
  | 'Pipfile.lock'
  | 'Pipfile'
  | 'requirements.txt'
  | null;
export interface InstallSourceInfo {
  manifestPath: string | null;
  manifestType: ManifestType;
  manifestContent: string | undefined;
}

interface DetectInstallSourceParams {
  workPath: string;
  entryDirectory: string;
  fsFiles: Record<string, any>;
}

export async function detectInstallSource({
  workPath,
  entryDirectory,
  fsFiles,
}: DetectInstallSourceParams): Promise<InstallSourceInfo> {
  const uvLockDir = findDir({
    file: 'uv.lock',
    entryDirectory,
    workPath,
    fsFiles,
  });
  const pyprojectDir = findDir({
    file: 'pyproject.toml',
    entryDirectory,
    workPath,
    fsFiles,
  });
  const pipfileLockDir = findDir({
    file: 'Pipfile.lock',
    entryDirectory,
    workPath,
    fsFiles,
  });
  const pipfileDir = findDir({
    file: 'Pipfile',
    entryDirectory,
    workPath,
    fsFiles,
  });
  const requirementsDir = findDir({
    file: 'requirements.txt',
    entryDirectory,
    workPath,
    fsFiles,
  });

  let manifestPath: string | null = null;
  let manifestType: ManifestType = null;

  // Prefer uv.lock, then pyproject.toml, then Pipfile.lock, then Pipfile,
  // then requirements.txt (local, then global).
  if (uvLockDir && pyprojectDir) {
    manifestType = 'uv.lock';
    manifestPath = join(uvLockDir, 'uv.lock');
  } else if (pyprojectDir) {
    manifestType = 'pyproject.toml';
    manifestPath = join(pyprojectDir, 'pyproject.toml');
  } else if (pipfileLockDir) {
    manifestType = 'Pipfile.lock';
    manifestPath = join(pipfileLockDir, 'Pipfile.lock');
  } else if (pipfileDir) {
    manifestType = 'Pipfile';
    manifestPath = join(pipfileDir, 'Pipfile');
  } else if (requirementsDir) {
    manifestType = 'requirements.txt';
    manifestPath = join(requirementsDir, 'requirements.txt');
  }

  let manifestContent: string | undefined;
  if (manifestPath) {
    try {
      manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
    } catch (err) {
      debug('Failed to read install manifest contents', err);
    }
  }

  return { manifestPath, manifestType, manifestContent };
}

export async function createPyprojectToml({
  projectName,
  pyprojectPath,
  dependencies,
}: {
  projectName: string;
  pyprojectPath: string;
  dependencies: string[];
}) {
  const requiresPython = `~=${DEFAULT_PYTHON_VERSION}.0`;

  const depsToml =
    dependencies.length > 0
      ? [
          'dependencies = [',
          ...dependencies.map(dep => `  "${dep}",`),
          ']',
        ].join('\n')
      : 'dependencies = []';

  const content = [
    '[project]',
    `name = "${projectName}"`,
    'version = "0.1.0"',
    `requires-python = "${requiresPython}"`,
    'classifiers = [',
    '  "Private :: Do Not Upload",',
    ']',
    depsToml,
    '',
  ].join('\n');

  await fs.promises.writeFile(pyprojectPath, content);
}

export interface UvProjectInfo {
  projectDir: string;
  pyprojectPath: string;
  lockPath: string;
}

interface EnsureUvProjectParams {
  workPath: string;
  entryDirectory: string;
  fsFiles: Record<string, any>;
  repoRootPath?: string;
  pythonPath: string;
  pipPath: string;
  uv: UvRunner;
  venvPath: string;
  meta: Meta;
  runtimeDependencies: string[];
}

function getDependencyName(spec: string): string {
  const match = spec.match(/^[A-Za-z0-9_.-]+/);
  return match ? match[0].toLowerCase() : spec.toLowerCase();
}

async function filterMissingRuntimeDependencies({
  pyprojectPath,
  runtimeDependencies,
}: {
  pyprojectPath: string;
  runtimeDependencies: string[];
}): Promise<string[]> {
  let declared: string[] = [];
  try {
    const config = await readConfigFile<{
      project?: { dependencies?: string[] };
    }>(pyprojectPath);
    declared = config?.project?.dependencies || [];
  } catch (err) {
    debug('Failed to parse pyproject.toml when filtering runtime deps', err);
  }
  const declaredNames = new Set(declared.map(getDependencyName));
  return runtimeDependencies.filter(spec => {
    const name = getDependencyName(spec);
    return !declaredNames.has(name);
  });
}

function findUvLockUpwards(
  startDir: string,
  repoRootPath?: string
): string | null {
  // In uv workspaces, `uv.lock` is typically written at the workspace root, not
  // necessarily next to the member project being synced. When Vercel builds from
  // a subdirectory (rootDirectory), we still want to honor that workspace lock.
  const start = resolve(startDir);
  const base = repoRootPath ? resolve(repoRootPath) : undefined;

  for (const dir of traverseUpDirectories({ start, base })) {
    const lockPath = join(dir, 'uv.lock');
    const pyprojectPath = join(dir, 'pyproject.toml');
    if (fs.existsSync(lockPath) && fs.existsSync(pyprojectPath)) {
      return lockPath;
    }
  }
  return null;
}

export async function ensureUvProject({
  workPath,
  entryDirectory,
  fsFiles,
  repoRootPath,
  pythonPath,
  pipPath,
  uv,
  venvPath,
  meta,
  runtimeDependencies,
}: EnsureUvProjectParams): Promise<UvProjectInfo> {
  const uvPath = uv.getPath();

  const installInfo = await detectInstallSource({
    workPath,
    entryDirectory,
    fsFiles,
  });
  const { manifestType, manifestPath } = installInfo;

  let projectDir: string;
  let pyprojectPath: string;
  let lockPath: string | null = null;

  if (manifestType === 'uv.lock') {
    if (!manifestPath) {
      throw new Error('Expected uv.lock path to be resolved, but it was null');
    }
    projectDir = dirname(manifestPath);
    pyprojectPath = join(projectDir, 'pyproject.toml');
    if (!fs.existsSync(pyprojectPath)) {
      throw new Error(
        `Expected "pyproject.toml" next to "uv.lock" in "${projectDir}"`
      );
    }
    lockPath = manifestPath;
    console.log('Installing required dependencies from uv.lock...');
  } else if (manifestType === 'pyproject.toml') {
    if (!manifestPath) {
      throw new Error(
        'Expected pyproject.toml path to be resolved, but it was null'
      );
    }
    projectDir = dirname(manifestPath);
    pyprojectPath = manifestPath;
    console.log('Installing required dependencies from pyproject.toml...');

    // If a workspace-root uv.lock exists (common in monorepos), use it as-is.
    const workspaceLock = findUvLockUpwards(projectDir, repoRootPath);
    if (workspaceLock) {
      lockPath = workspaceLock;
    } else {
      // Otherwise, generate a lock. In uv workspaces, this may still write
      // the lockfile at the workspace root, not necessarily in projectDir.
      await uv.lock(projectDir);
    }
  } else if (manifestType === 'Pipfile.lock' || manifestType === 'Pipfile') {
    if (!manifestPath) {
      throw new Error(
        'Expected Pipfile/Pipfile.lock path to be resolved, but it was null'
      );
    }
    projectDir = dirname(manifestPath);
    console.log(`Installing required dependencies from ${manifestType}...`);
    const exportedReq = await exportRequirementsFromPipfile({
      pythonPath,
      pipPath,
      uvPath,
      projectDir,
      meta,
    });
    pyprojectPath = join(projectDir, 'pyproject.toml');
    if (!fs.existsSync(pyprojectPath)) {
      await createPyprojectToml({
        projectName: 'app',
        pyprojectPath,
        dependencies: [],
      });
    }
    await uv.addFromFile({
      venvPath,
      projectDir,
      requirementsPath: exportedReq,
    });
  } else if (manifestType === 'requirements.txt') {
    if (!manifestPath) {
      throw new Error(
        'Expected requirements.txt path to be resolved, but it was null'
      );
    }
    projectDir = dirname(manifestPath);
    pyprojectPath = join(projectDir, 'pyproject.toml');
    console.log(
      'Installing required dependencies from requirements.txt with uv...'
    );
    if (!fs.existsSync(pyprojectPath)) {
      await createPyprojectToml({
        projectName: 'app',
        pyprojectPath,
        dependencies: [],
      });
    }
    await uv.addFromFile({
      venvPath,
      projectDir,
      requirementsPath: manifestPath,
    });
  } else {
    // No manifest detected – create a minimal uv project at the workPath so
    // that runtime dependencies are still managed and locked via uv.
    projectDir = workPath;
    pyprojectPath = join(projectDir, 'pyproject.toml');
    console.log(
      'No Python manifest found; creating an empty pyproject.toml and uv.lock...'
    );
    await createPyprojectToml({
      projectName: 'app',
      pyprojectPath,
      dependencies: [],
    });
    await uv.lock(projectDir);
  }

  if (runtimeDependencies.length) {
    const missingRuntimeDeps = await filterMissingRuntimeDependencies({
      pyprojectPath,
      runtimeDependencies,
    });
    if (missingRuntimeDeps.length) {
      await uv.addDependencies({
        venvPath,
        projectDir,
        dependencies: missingRuntimeDeps,
      });
    }
  }

  // Re-resolve lockfile in case earlier operations (uv add/lock) wrote it at a
  // workspace root directory rather than `projectDir`.
  const resolvedLockPath =
    lockPath && fs.existsSync(lockPath)
      ? lockPath
      : findUvLockUpwards(projectDir, repoRootPath) ||
        join(projectDir, 'uv.lock');

  return { projectDir, pyprojectPath, lockPath: resolvedLockPath };
}

async function pipInstall(
  pipPath: string,
  uvPath: string | null,
  workPath: string,
  args: string[],
  targetDir?: string
) {
  const target = targetDir
    ? join(targetDir, resolveVendorDir())
    : resolveVendorDir();
  // See: https://github.com/pypa/pip/issues/4222#issuecomment-417646535
  //
  // Disable installing to the Python user install directory, which is
  // the default behavior on Debian systems and causes error:
  //
  // distutils.errors.DistutilsOptionError: can't combine user with
  // prefix, exec_prefix/home, or install_(plat)base
  process.env.PIP_USER = '0';

  if (uvPath) {
    const uvArgs = [
      'pip',
      'install',
      '--no-compile',
      '--no-cache-dir',
      '--target',
      target,
      ...filterUnsafeUvPipArgs(args),
    ];
    const prettyUv = `${uvPath} ${uvArgs.join(' ')}`;
    debug(`Running "${prettyUv}"...`);
    try {
      await execa(uvPath!, uvArgs, {
        cwd: workPath,
        env: getProtectedUvEnv(),
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

interface InstallRequirementArg {
  pythonPath: string;
  pipPath: string;
  uvPath: string | null;
  dependency: string;
  version: string;
  workPath: string;
  targetDir?: string;
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
  uvPath,
  dependency,
  version,
  workPath,
  targetDir,
  meta,
  args = [],
}: InstallRequirementArg) {
  const actualTargetDir = targetDir || workPath;
  if (
    meta.isDev &&
    (await isInstalled(pythonPath, dependency, actualTargetDir))
  ) {
    debug(
      `Skipping ${dependency} dependency installation, already installed in ${actualTargetDir}`
    );
    return;
  }
  const exact = `${dependency}==${version}`;
  await pipInstall(pipPath, uvPath, workPath, [exact, ...args], targetDir);
}

interface InstallRequirementsFileArg {
  pythonPath: string;
  pipPath: string;
  uvPath: string | null;
  filePath: string;
  workPath: string;
  targetDir?: string;
  meta: Meta;
  args?: string[];
}

export async function installRequirementsFile({
  pythonPath,
  pipPath,
  uvPath,
  filePath,
  workPath,
  targetDir,
  meta,
  args = [],
}: InstallRequirementsFileArg) {
  // The Vercel platform already handles `requirements.txt` for frontend projects,
  // but the installation logic there is different, because it seems to install all
  // of the dependencies globally, whereas, for this Runtime, we want it to happen only
  // locally, so we'll run a separate installation.

  const actualTargetDir = targetDir || workPath;
  if (
    meta.isDev &&
    (await areRequirementsInstalled(pythonPath, filePath, actualTargetDir))
  ) {
    debug(`Skipping requirements file installation, already installed`);
    return;
  }
  await pipInstall(
    pipPath,
    uvPath,
    workPath,
    ['--upgrade', '-r', filePath, ...args],
    targetDir
  );
}

export async function exportRequirementsFromPipfile({
  pythonPath,
  pipPath,
  uvPath,
  projectDir,
  meta,
}: {
  pythonPath: string;
  pipPath: string;
  uvPath: string | null;
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
    uvPath,
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

export async function mirrorSitePackagesIntoVendor({
  venvPath,
  vendorDirName,
}: {
  venvPath: string;
  vendorDirName: string;
}): Promise<Files> {
  const vendorFiles: Files = {};
  // Map the files from site-packages in the virtual environment
  // into the Lambda bundle under `_vendor`.
  try {
    const sitePackageDirs = await getVenvSitePackagesDirs(venvPath);
    for (const dir of sitePackageDirs) {
      if (!fs.existsSync(dir)) continue;

      const dirFiles = await glob('**', dir);
      for (const relativePath of Object.keys(dirFiles)) {
        if (
          relativePath.endsWith('.pyc') ||
          relativePath.includes('__pycache__')
        ) {
          continue;
        }

        const srcFsPath = join(dir, relativePath);

        const bundlePath = join(vendorDirName, relativePath).replace(
          /\\/g,
          '/'
        );
        vendorFiles[bundlePath] = new FileFsRef({ fsPath: srcFsPath });
      }
    }
  } catch (err) {
    console.log('Failed to collect site-packages from virtual environment');
    throw err;
  }

  return vendorFiles;
}
