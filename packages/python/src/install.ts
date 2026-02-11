import execa from 'execa';
import fs from 'fs';
import { join, dirname } from 'path';
import {
  FileFsRef,
  Files,
  Meta,
  NowBuildError,
  debug,
  glob,
} from '@vercel/build-utils';
import {
  discoverPythonPackage,
  stringifyManifest,
  createMinimalManifest,
  PythonAnalysisError,
  PythonLockFileKind,
  PythonManifestConvertedKind,
  type PythonPackage,
} from '@vercel/python-analysis';
import { getVenvPythonBin } from './utils';
import { UvRunner, filterUnsafeUvPipArgs, getProtectedUvEnv } from './uv';
import { DEFAULT_PYTHON_VERSION } from './version';

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

function toBuildError(error: PythonAnalysisError): NowBuildError {
  return new NowBuildError({
    code: error.code,
    message: error.message,
    link: error.link,
    action: error.action,
  });
}

export type ManifestType = 'uv.lock' | 'pylock.toml' | 'pyproject.toml' | null;

export interface InstallSourceInfo {
  manifestPath: string | null;
  manifestType: ManifestType;
  /** The discovered package info from python-analysis. */
  pythonPackage?: PythonPackage;
}

interface DetectInstallSourceParams {
  workPath: string;
  entryDirectory: string;
  repoRootPath?: string;
}

export async function detectInstallSource({
  workPath,
  entryDirectory,
  repoRootPath,
}: DetectInstallSourceParams): Promise<InstallSourceInfo> {
  const entrypointDir = join(workPath, entryDirectory);
  const rootDir = repoRootPath ?? workPath;

  let pythonPackage: PythonPackage;
  try {
    pythonPackage = await discoverPythonPackage({
      entrypointDir,
      rootDir,
    });
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      throw toBuildError(error);
    }
    throw error;
  }

  // Determine effective manifest type based on lock file and manifest presence
  let manifestType: ManifestType = null;
  let manifestPath: string | null = null;

  // Check for lock file first (highest priority)
  const lockFile =
    pythonPackage.manifest?.lockFile ?? pythonPackage.workspaceLockFile;
  if (lockFile) {
    if (lockFile.kind === PythonLockFileKind.UvLock) {
      manifestType = 'uv.lock';
      manifestPath = join(rootDir, lockFile.path);
    } else if (lockFile.kind === PythonLockFileKind.PylockToml) {
      manifestType = 'pylock.toml';
      manifestPath = join(rootDir, lockFile.path);
    }
  } else if (pythonPackage.manifest) {
    // No lock file, but have a manifest (native or converted)
    manifestType = 'pyproject.toml';
    manifestPath = join(rootDir, pythonPackage.manifest.path);
  }

  return { manifestPath, manifestType, pythonPackage };
}

export async function createPyprojectToml({
  projectName,
  pyprojectPath,
  dependencies,
  pythonVersion,
}: {
  projectName: string;
  pyprojectPath: string;
  dependencies: string[];
  pythonVersion?: string;
}) {
  const version = pythonVersion ?? DEFAULT_PYTHON_VERSION;
  const requiresPython = `~=${version}.0`;

  const manifest = createMinimalManifest({
    name: projectName,
    requiresPython,
    dependencies,
  });

  const content = stringifyManifest(manifest);
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
  repoRootPath?: string;
  pythonVersion: string;
  uv: UvRunner;
}

export async function ensureUvProject({
  workPath,
  entryDirectory,
  repoRootPath,
  pythonVersion,
  uv,
}: EnsureUvProjectParams): Promise<UvProjectInfo> {
  const rootDir = repoRootPath ?? workPath;

  const installInfo = await detectInstallSource({
    workPath,
    entryDirectory,
    repoRootPath,
  });
  const { manifestType, pythonPackage } = installInfo;
  const manifest = pythonPackage?.manifest;

  let projectDir: string;
  let pyprojectPath: string;
  let lockPath: string | null = null;

  if (manifestType === 'uv.lock' || manifestType === 'pylock.toml') {
    // Lock file exists - use it directly
    const lockFile =
      pythonPackage?.manifest?.lockFile ?? pythonPackage?.workspaceLockFile;
    if (!lockFile) {
      throw new Error(
        `Expected lock file path to be resolved, but it was null`
      );
    }
    lockPath = join(rootDir, lockFile.path);
    // Project dir is where the lock file is located
    projectDir = dirname(lockPath);
    pyprojectPath = join(projectDir, 'pyproject.toml');

    if (!fs.existsSync(pyprojectPath)) {
      throw new Error(
        `Expected "pyproject.toml" next to "${lockFile.kind}" in "${projectDir}"`
      );
    }
    console.log(`Installing required dependencies from ${lockFile.kind}...`);
  } else if (manifest) {
    // Manifest exists (native pyproject.toml or converted from Pipfile/requirements.txt)
    projectDir = join(rootDir, dirname(manifest.path));
    pyprojectPath = join(rootDir, manifest.path);

    // Log the original source for user clarity
    const originKind = manifest.origin?.kind;
    if (originKind === PythonManifestConvertedKind.Pipfile) {
      console.log('Installing required dependencies from Pipfile...');
    } else if (originKind === PythonManifestConvertedKind.PipfileLock) {
      console.log('Installing required dependencies from Pipfile.lock...');
    } else if (
      originKind === PythonManifestConvertedKind.RequirementsTxt ||
      originKind === PythonManifestConvertedKind.RequirementsIn
    ) {
      console.log(
        `Installing required dependencies from ${manifest.origin?.path ?? 'requirements.txt'}...`
      );
    } else {
      console.log('Installing required dependencies from pyproject.toml...');
    }

    // If this is a converted manifest, write the pyproject.toml to disk
    if (manifest.origin) {
      // Inject requires-python for the target version if not already set,
      // so that `uv lock` and `uv sync` agree on the Python constraint.
      if (manifest.data.project && !manifest.data.project['requires-python']) {
        manifest.data.project['requires-python'] = `~=${pythonVersion}.0`;
      }
      const content = stringifyManifest(manifest.data);
      // Write to the same directory as the original manifest
      pyprojectPath = join(projectDir, 'pyproject.toml');
      await fs.promises.writeFile(pyprojectPath, content);
    }

    // Check for workspace lock file
    const workspaceLockFile = pythonPackage?.workspaceLockFile;
    if (workspaceLockFile) {
      lockPath = join(rootDir, workspaceLockFile.path);
    } else {
      // Generate a lock file
      await uv.lock(projectDir);
    }
  } else {
    // No manifest detected – create a minimal uv project at the workPath so
    // that runtime dependencies are still managed and locked via uv.
    projectDir = workPath;
    pyprojectPath = join(projectDir, 'pyproject.toml');
    console.log(
      'No Python manifest found; creating an empty pyproject.toml and uv.lock...'
    );

    const requiresPython = `~=${pythonVersion}.0`;
    const minimalManifest = createMinimalManifest({
      name: 'app',
      requiresPython,
      dependencies: [],
    });
    const content = stringifyManifest(minimalManifest);
    await fs.promises.writeFile(pyprojectPath, content);
    await uv.lock(projectDir);
  }

  // Re-resolve lockfile in case earlier operations (uv add/lock) wrote it at a
  // workspace root directory rather than `projectDir`.
  const resolvedLockPath =
    lockPath && fs.existsSync(lockPath)
      ? lockPath
      : join(projectDir, 'uv.lock');

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
