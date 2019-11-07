import { join, dirname, basename } from 'path';
import execa from 'execa';
import fs from 'fs';
import { promisify } from 'util';
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
import {
  getWriteableDirectory,
  download,
  glob,
  createLambda,
  shouldServe,
  BuildOptions,
  debug,
  getLambdaOptionsFromFunction,
} from '@now/build-utils';

async function pipInstall(pipPath: string, workDir: string, ...args: string[]) {
  const target = '.';
  // See: https://github.com/pypa/pip/issues/4222#issuecomment-417646535
  //
  // Disable installing to the Python user install directory, which is
  // the default behavior on Debian systems and causes error:
  //
  // distutils.errors.DistutilsOptionError: can't combine user with
  // prefix, exec_prefix/home, or install_(plat)base
  process.env.PIP_USER = '0';
  debug(
    `Running "pip install --disable-pip-version-check --target ${target} --upgrade ${args.join(
      ' '
    )}"...`
  );
  try {
    await execa(
      pipPath,
      [
        'install',
        '--disable-pip-version-check',
        '--target',
        target,
        '--upgrade',
        ...args,
      ],
      {
        cwd: workDir,
        stdio: 'pipe',
      }
    );
  } catch (err) {
    console.log(
      `Failed to run "pip install --disable-pip-version-check --target ${target} --upgrade ${args.join(
        ' '
      )}"...`
    );
    throw err;
  }
}

async function pipenvConvert(cmd: string, srcDir: string) {
  debug('Running pipfile2req...');
  try {
    const out = await execa.stdout(cmd, [], {
      cwd: srcDir,
    });
    fs.writeFileSync(join(srcDir, 'requirements.txt'), out);
  } catch (err) {
    console.log('Failed to run "pipfile2req"');
    throw err;
  }
}

export const build = async ({
  workPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}: BuildOptions) => {
  debug('Downloading user files...');
  let downloadedFiles = await download(originalFiles, workPath, meta);

  if (meta.isDev) {
    let base = null;

    if (config && config.zeroConfig) {
      base = workPath;
    } else {
      base = dirname(downloadedFiles['now.json'].fsPath);
    }

    const destNow = join(base, '.now', 'cache', basename(entrypoint, '.py'));
    await download(downloadedFiles, destNow);
    downloadedFiles = await glob('**', destNow);
    workPath = destNow;
  }

  const pipPath = 'pip3';

  try {
    // See: https://stackoverflow.com/a/44728772/376773
    //
    // The `setup.cfg` is required for `now dev` on MacOS, where without
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

  console.log('Installing dependencies...');
  await pipInstall(pipPath, workPath, 'werkzeug');

  let fsFiles = await glob('**', workPath);
  const entryDirectory = dirname(entrypoint);

  const pipfileLockDir = fsFiles[join(entryDirectory, 'Pipfile.lock')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile.lock']
    ? workPath
    : null;

  if (pipfileLockDir) {
    debug('Found "Pipfile.lock"');

    // Convert Pipenv.Lock to requirements.txt.
    // We use a different`workPath` here because we want `pipfile-requirements` and it's dependencies
    // to not be part of the lambda environment. By using pip's `--target` directive we can isolate
    // it into a separate folder.
    const tempDir = await getWriteableDirectory();
    await pipInstall(
      pipPath,
      tempDir,
      'pipfile-requirements',
      '--no-warn-script-location'
    );

    // Python needs to know where to look up all the packages we just installed.
    // We tell it to use the same location as used with `--target`
    process.env.PYTHONPATH = tempDir;
    const convertCmd = join(tempDir, 'bin', 'pipfile2req');
    await pipenvConvert(convertCmd, pipfileLockDir);
  }

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');

  if (fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await pipInstall(pipPath, workPath, '-r', requirementsTxtPath);
  } else if (fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await pipInstall(pipPath, workPath, '-r', requirementsTxtPath);
  }

  const originalPyPath = join(__dirname, '..', 'now_init.py');
  const originalNowHandlerPyContents = await readFile(originalPyPath, 'utf8');

  // will be used on `from $here import handler`
  // for example, `from api.users import handler`
  debug('Entrypoint is', entrypoint);
  const userHandlerFilePath = entrypoint
    .replace(/\//g, '.')
    .replace(/\.py$/, '');
  const nowHandlerPyContents = originalNowHandlerPyContents.replace(
    /__NOW_HANDLER_FILENAME/g,
    userHandlerFilePath
  );

  // in order to allow the user to have `server.py`, we need our `server.py` to be called
  // somethig else
  const nowHandlerPyFilename = 'now__handler__python';

  await writeFile(
    join(workPath, `${nowHandlerPyFilename}.py`),
    nowHandlerPyContents
  );

  // Use the system-installed version of `python3` when running via `now dev`
  const runtime = meta.isDev ? 'python3' : 'python3.6';

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const lambda = await createLambda({
    files: await glob('**', workPath),
    handler: `${nowHandlerPyFilename}.now_handler`,
    runtime,
    environment: {},
    ...lambdaOptions,
  });

  return {
    [entrypoint]: lambda,
  };
};

export { shouldServe };
