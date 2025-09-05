import * as fs from 'fs';
import execa = require('execa');
import { promisify } from 'util';
import { join, dirname, basename } from 'path';
import {
  getWriteableDirectory,
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
} from '@vercel/build-utils';
import {
  installRequirement,
  installRequirementsFile,
  resolveVendorDir,
} from './install';
import { getLatestPythonVersion, getSupportedPythonVersion } from './version';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

async function updateGitIgnore(cwd: string, entry: string): Promise<boolean> {
  try {
    const gitignorePath = join(cwd, '.gitignore');
    let current = '';
    try {
      current = await readFile(gitignorePath, 'utf8');
    } catch (_) {
      // file may not exist yet
    }
    if (current.includes(entry)) return false;
    const needsNewline = current.length > 0 && !current.endsWith('\n');
    const next = (needsNewline ? current + '\n' : current) + entry + '\n';
    await writeFile(gitignorePath, next);
    return true;
  } catch (_) {
    return false;
  }
}

async function pipenvConvert(
  cmd: string,
  srcDir: string,
  env?: NodeJS.ProcessEnv
) {
  debug('Running pipfile2req...');
  try {
    const out = await execa.stdout(cmd, [], {
      cwd: srcDir,
      env,
    });
    debug('Contents of requirements.txt is: ' + out);
    fs.writeFileSync(join(srcDir, 'requirements.txt'), out);
  } catch (err) {
    console.log('Failed to run "pipfile2req"');
    throw err;
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

  console.log('Installing required dependencies...');

  await installRequirement({
    pythonPath: pythonVersion.pythonPath,
    pipPath: pythonVersion.pipPath,
    dependency: 'werkzeug',
    version: '1.0.1',
    workPath,
    meta,
  });

  let fsFiles = await glob('**', workPath);
  const entryDirectory = dirname(entrypoint);

  const hasReqLocal = !!fsFiles[join(entryDirectory, 'requirements.txt')];
  const hasReqGlobal = !!fsFiles['requirements.txt'];

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

  if (!hasReqLocal && !hasReqGlobal && (pipfileLockDir || pipfileDir)) {
    if (pipfileLockDir) {
      debug('Found "Pipfile.lock"');
    } else {
      debug('Found "Pipfile"');
    }

    if (pipfileLockDir) {
      let lock: {
        _meta?: {
          requires?: {
            python_version?: string;
          };
        };
      } = {};
      try {
        const json = await readFile(
          join(pipfileLockDir, 'Pipfile.lock'),
          'utf8'
        );
        lock = JSON.parse(json);
      } catch (err) {
        throw new NowBuildError({
          code: 'INVALID_PIPFILE_LOCK',
          message: 'Unable to parse Pipfile.lock',
        });
      }
      pythonVersion = getSupportedPythonVersion({
        isDev: meta.isDev,
        pipLockPythonVersion: lock?._meta?.requires?.python_version,
      });
    }

    if (!hasReqLocal && !hasReqGlobal) {
      // Convert Pipenv.Lock to requirements.txt.
      // We use a different`workPath` here because we want `pipfile-requirements` and it's dependencies
      // to not be part of the lambda environment. By using pip's `--target` directive we can isolate
      // it into a separate folder.
      const tempDir = await getWriteableDirectory();
      await installRequirement({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        dependency: 'pipfile-requirements',
        version: '0.3.0',
        workPath: tempDir,
        meta,
        args: ['--no-warn-script-location'],
      });

      // Scope PYTHONPATH to the conversion step only, and point at the vendor dir
      const tempVendorDir = join(tempDir, resolveVendorDir());
      const envForConvert = { ...process.env, PYTHONPATH: tempVendorDir };
      const convertCmd =
        process.platform === 'win32'
          ? join(tempVendorDir, 'Scripts', 'pipfile2req.exe')
          : join(tempVendorDir, 'bin', 'pipfile2req');
      await pipenvConvert(
        convertCmd,
        pipfileLockDir || pipfileDir!,
        envForConvert
      );
    } else {
      debug(
        'Skipping Pipfile.lock conversion because "requirements.txt" exists'
      );
    }
  }

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');

  if (fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath,
      meta,
    });
  } else if (fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath,
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
    '**/venv/**',
    '**/.venv/**',
    '**/__pycache__/**',
  ];

  const lambdaEnv = {} as Record<string, string>;
  lambdaEnv.PYTHONPATH = vendorDir;

  // update .gitignore
  const gitignoreEntry = vendorDir.endsWith('/') ? vendorDir : `${vendorDir}/`;
  const isGitIgnoreUpdated = await updateGitIgnore(workPath, gitignoreEntry);
  if (isGitIgnoreUpdated) {
    console.log(`Added ${gitignoreEntry} to .gitignore`);
  }

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? [...predefinedExcludes, config.excludeFiles]
        : predefinedExcludes,
  };

  const files: Files = await glob('**', globOptions);

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
