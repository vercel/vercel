import fs from 'fs';
import { promisify } from 'util';
import { join, dirname, basename, posix as pathPosix } from 'path';
import {
  download,
  glob,
  Lambda,
  FileBlob,
  shouldServe,
  debug,
  NowBuildError,
  type BuildOptions,
  type GlobOptions,
  type BuildV3,
  type Files,
  FileFsRef,
} from '@vercel/build-utils';
import {
  installRequirement,
  installRequirementsFile,
  resolveVendorDir,
  exportRequirementsFromUv,
  exportRequirementsFromPipfile,
} from './install';
import { readConfigFile } from '@vercel/build-utils';
import { getLatestPythonVersion, getSupportedPythonVersion } from './version';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const fastapiEntrypointFilenames = ['app', 'index', 'server', 'main'];
const fastapiEntrypointDirs = ['', 'src', 'app'];
const fastapiContentRegex =
  /(from\s+fastapi\s+import\s+FastAPI|import\s+fastapi|FastAPI\s*\()/;

const fastapiCandidateEntrypoints = fastapiEntrypointFilenames.flatMap(
  filename =>
    fastapiEntrypointDirs.map(dir => pathPosix.join(dir, `${filename}.py`))
);

function isFastapiEntrypoint(file: FileFsRef | { fsPath?: string }): boolean {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return false;
    const contents = fs.readFileSync(fsPath, 'utf8');
    return fastapiContentRegex.test(contents);
  } catch {
    return false;
  }
}

export const version = 3;

export async function downloadFilesInWorkPath({
  entrypoint,
  workPath,
  files,
  meta = {},
}: Pick<BuildOptions, 'entrypoint' | 'workPath' | 'files' | 'meta'>) {
  debug('Downloading user files...');
  let downloadedFiles = await download(files, workPath, meta);
  if (meta.isDev) {
    // Old versions of the CLI don't assign this property
    const { devCacheDir = join(workPath, '.now', 'cache') } = meta;
    const destCache = join(devCacheDir, basename(entrypoint, '.py'));
    await download(downloadedFiles, destCache);
    downloadedFiles = await glob('**', destCache);
    workPath = destCache;
  }
  return workPath;
}

export const build: BuildV3 = async ({
  workPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}) => {
  let pythonVersion = getLatestPythonVersion(meta);

  workPath = await downloadFilesInWorkPath({
    workPath,
    files: originalFiles,
    entrypoint,
    meta,
  });

  try {
    // See: https://stackoverflow.com/a/44728772/376773
    //
    // The `setup.cfg` is required for `vercel dev` on MacOS, where without
    // this file being present in the src dir then this error happens:
    //
    // distutils.errors.DistutilsOptionError: must supply either home
    // or prefix/exec-prefix -- not both
    if (meta.isDev) {
      const setupCfg = join(workPath, 'setup.cfg');
      await writeFile(setupCfg, '[install]\nprefix=\n');
    }
  } catch (err) {
    console.log('Failed to create "setup.cfg" file');
    throw err;
  }

  let fsFiles = await glob('**', workPath);

  // Zero-config entrypoint discovery
  if (!fsFiles[entrypoint]) {
    let discovered: string | undefined;

    if (config?.framework === 'fastapi') {
      const entrypointCandidates = fastapiCandidateEntrypoints.filter(
        c => !!fsFiles[c]
      );
      if (entrypointCandidates.length) {
        const fastapiEntrypoint = entrypointCandidates.find(c =>
          isFastapiEntrypoint(fsFiles[c] as FileFsRef)
        );
        discovered = fastapiEntrypoint || entrypointCandidates[0];
      }
    }

    if (discovered) {
      debug(
        `Resolved Python entrypoint to "${discovered}" (configured "${entrypoint}" not found).`
      );
      entrypoint = discovered;
    } else if (config?.framework === 'fastapi') {
      const searchedList = fastapiCandidateEntrypoints.join(', ');
      throw new NowBuildError({
        code: 'FASTAPI_ENTRYPOINT_NOT_FOUND',
        message: `No FastAPI entrypoint found. Searched for: ${searchedList}`,
      });
    }
  }

  const entryDirectory = dirname(entrypoint);

  const hasReqLocal = !!fsFiles[join(entryDirectory, 'requirements.txt')];
  const hasReqGlobal = !!fsFiles['requirements.txt'];

  const uvLockDir = fsFiles[join(entryDirectory, 'uv.lock')]
    ? join(workPath, entryDirectory)
    : fsFiles['uv.lock']
      ? workPath
      : null;
  const pyprojectDir = fsFiles[join(entryDirectory, 'pyproject.toml')]
    ? join(workPath, entryDirectory)
    : fsFiles['pyproject.toml']
      ? workPath
      : null;

  const pipfileLockDir = fsFiles[join(entryDirectory, 'Pipfile.lock')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile.lock']
      ? workPath
      : null;
  const pipfileDir = fsFiles[join(entryDirectory, 'Pipfile')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile']
      ? workPath
      : null;

  // Determine Python version from pyproject.toml or Pipfile.lock if present.
  if (pyprojectDir) {
    let requiresPython: string | undefined;
    try {
      const pyproject = await readConfigFile<{
        project?: { ['requires-python']?: string };
      }>(join(pyprojectDir, 'pyproject.toml'));
      requiresPython = pyproject?.project?.['requires-python'];
    } catch {
      debug('Failed to parse pyproject.toml');
    }
    if (requiresPython && /\b\d+\.\d+\b/.test(requiresPython.trim())) {
      const exact = requiresPython.trim().match(/\b\d+\.\d+\b/)![0];
      const selected = getSupportedPythonVersion({
        isDev: meta.isDev,
        declaredPythonVersion: { version: exact, source: 'pyproject.toml' },
      });
      pythonVersion = selected;
    }
  } else if (pipfileLockDir) {
    let lock: {
      _meta?: { requires?: { python_version?: string } };
    } = {};
    try {
      const json = await readFile(join(pipfileLockDir, 'Pipfile.lock'), 'utf8');
      lock = JSON.parse(json);
    } catch (err) {
      throw new NowBuildError({
        code: 'INVALID_PIPFILE_LOCK',
        message: 'Unable to parse Pipfile.lock',
      });
    }
    const pyFromLock = lock?._meta?.requires?.python_version;
    pythonVersion = getSupportedPythonVersion({
      isDev: meta.isDev,
      declaredPythonVersion: pyFromLock
        ? { version: pyFromLock, source: 'Pipfile.lock' }
        : undefined,
    });
  }

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');

  // Compute cache vendor dir keyed by Python version and entrypoint directory
  const vendorBaseDir = join(
    workPath,
    '.vercel',
    'python',
    `py${pythonVersion.version}`,
    entryDirectory
  );
  try {
    await fs.promises.mkdir(vendorBaseDir, { recursive: true });
  } catch (err) {
    console.log('Failed to create vendor cache directory');
    throw err;
  }

  console.log('Installing required dependencies...');

  await installRequirement({
    pythonPath: pythonVersion.pythonPath,
    pipPath: pythonVersion.pipPath,
    dependency: 'werkzeug',
    version: '1.0.1',
    workPath: vendorBaseDir,
    meta,
  });

  let installedFromProjectFiles = false;

  // Prefer uv.lock, then pyproject.toml, then Pipfile/Pipfile.lock, then requirements.txt
  if (uvLockDir) {
    debug('Found "uv.lock"');
    if (pyprojectDir) {
      const exportedReq = await exportRequirementsFromUv(
        pythonVersion.pythonPath,
        pyprojectDir,
        { locked: true }
      );
      await installRequirementsFile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        filePath: exportedReq,
        workPath: vendorBaseDir,
        meta,
      });
      installedFromProjectFiles = true;
    } else {
      debug('Skipping uv export because "pyproject.toml" was not found');
    }
  } else if (pyprojectDir) {
    debug('Found "pyproject.toml"');
    if (hasReqLocal || hasReqGlobal) {
      console.log(
        'Detected both pyproject.toml and requirements.txt but no lockfile; using pyproject.toml'
      );
    }
    const exportedReq = await exportRequirementsFromUv(
      pythonVersion.pythonPath,
      pyprojectDir,
      { locked: false }
    );
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: exportedReq,
      workPath: vendorBaseDir,
      meta,
    });
    installedFromProjectFiles = true;
  } else if (pipfileLockDir || pipfileDir) {
    debug(`Found ${pipfileLockDir ? '"Pipfile.lock"' : '"Pipfile"'}`);
    if (hasReqLocal || hasReqGlobal) {
      debug('Skipping Pipfile export because "requirements.txt" exists');
    } else {
      const exportedReq = await exportRequirementsFromPipfile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        projectDir: pipfileLockDir || pipfileDir!,
        meta,
      });
      await installRequirementsFile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        filePath: exportedReq,
        workPath: vendorBaseDir,
        meta,
      });
      installedFromProjectFiles = true;
    }
  }

  if (!installedFromProjectFiles && fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath: vendorBaseDir,
      meta,
    });
  } else if (!installedFromProjectFiles && fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath: vendorBaseDir,
      meta,
    });
  }

  const originalPyPath = join(__dirname, '..', 'vc_init.py');
  const originalHandlerPyContents = await readFile(originalPyPath, 'utf8');
  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/, '');
  const vendorDir = resolveVendorDir();

  // Since `vercel dev` renames source files, we must reference the original
  const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
  const entrypointWithSuffix = `${entrypoint}${suffix}`;
  debug('Entrypoint with suffix is', entrypointWithSuffix);
  const handlerPyContents = originalHandlerPyContents
    .replace(/__VC_HANDLER_MODULE_NAME/g, moduleName)
    .replace(/__VC_HANDLER_ENTRYPOINT/g, entrypointWithSuffix)
    .replace(/__VC_HANDLER_VENDOR_DIR/g, vendorDir);

  const predefinedExcludes = [
    '.git/**',
    '.gitignore',
    '.vercel/**',
    '.pnpm-store/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.venv/**',
    '**/venv/**',
    '**/__pycache__/**',
  ];

  const lambdaEnv = {} as Record<string, string>;
  lambdaEnv.PYTHONPATH = vendorDir;

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? [...predefinedExcludes, config.excludeFiles]
        : predefinedExcludes,
  };

  const files: Files = await glob('**', globOptions);

  // Mount cached vendor directory into the Lambda output under `_vendor`
  try {
    const cachedVendorAbs = join(vendorBaseDir, resolveVendorDir());
    if (fs.existsSync(cachedVendorAbs)) {
      const vendorFiles = await glob('**', cachedVendorAbs, resolveVendorDir());
      for (const [p, f] of Object.entries(vendorFiles)) {
        files[p] = f;
      }
    }
  } catch (err) {
    console.log('Failed to include cached vendor directory');
    throw err;
  }

  // in order to allow the user to have `server.py`, we
  // need our `server.py` to be called something else
  const handlerPyFilename = 'vc__handler__python';

  files[`${handlerPyFilename}.py`] = new FileBlob({ data: handlerPyContents });

  // "fasthtml" framework requires a `.sesskey` file to exist,
  // otherwise it tries to create one at runtime, which fails
  // due Lambda's read-only filesystem
  if (config.framework === 'fasthtml') {
    const { SESSKEY = '' } = process.env;
    files['.sesskey'] = new FileBlob({ data: `"${SESSKEY}"` });
  }

  const output = new Lambda({
    files,
    handler: `${handlerPyFilename}.vc_handler`,
    runtime: pythonVersion.runtime,
    environment: lambdaEnv,
    supportsResponseStreaming: true,
  });

  return { output };
};

export { shouldServe };

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
