const path = require('path');
const execa = require('execa');
const { readFile, writeFile } = require('fs.promised');
const {
  getWriteableDirectory,
  download,
  glob,
  createLambda,
} = require('@now/build-utils'); // eslint-disable-line import/no-extraneous-dependencies
const downloadAndInstallPip = require('./download-and-install-pip');

async function pipInstall(pipPath, workDir, ...args) {
  console.log(`running "pip install --target ${workDir} ${args.join(' ')}"...`);
  try {
    await execa(pipPath, ['install', '--target', '.', '--upgrade', ...args], {
      cwd: workDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.log(`failed to run "pip install -t ${workDir} ${args.join(' ')}"`);
    throw err;
  }
}

async function pipInstallUser(pipPath, ...args) {
  console.log(`running "pip install --user ${args.join(' ')}"...`);
  try {
    await execa(pipPath, ['install', '--user', ...args], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.log(`failed to run "pip install --user ${args.join(' ')}"`);
    throw err;
  }
}

async function pipenvInstall(pyUserBase, srcDir) {
  console.log('running "pipenv_to_requirements -f');
  try {
    await execa(
      path.join(pyUserBase, 'bin', 'pipenv_to_requirements'),
      ['-f'],
      { cwd: srcDir, stdio: 'inherit' },
    );
  } catch (err) {
    console.log('failed to run "pipenv_to_requirements -f"');
    throw err;
  }
}

exports.config = {
  maxLambdaSize: '5mb',
};

exports.build = async ({ workPath, files, entrypoint }) => {
  console.log('downloading files...');

  // eslint-disable-next-line no-param-reassign
  files = await download(files, workPath);

  // this is where `pip` will be installed to
  // we need it to be under `/tmp`
  const pyUserBase = await getWriteableDirectory();
  process.env.PYTHONUSERBASE = pyUserBase;

  const pipPath = await downloadAndInstallPip();

  await pipInstall(pipPath, workPath, 'werkzeug');

  try {
    // See: https://stackoverflow.com/a/44728772/376773
    //
    // The `setup.cfg` is required for `now dev` on MacOS, where without
    // this file being present in the src dir then this error happens:
    //
    // distutils.errors.DistutilsOptionError: must supply either home
    // or prefix/exec-prefix -- not both
    const setupCfg = path.join(workPath, 'setup.cfg');
    await writeFile(setupCfg, '[install]\nprefix=\n');
  } catch (err) {
    console.log('failed to create "setup.cfg" file');
    throw err;
  }

  await pipInstall(pipPath, workPath, 'requests');

  const entryDirectory = path.dirname(entrypoint);
  const requirementsTxt = path.join(entryDirectory, 'requirements.txt');

  if (files['Pipfile.lock']) {
    console.log('found "Pipfile.lock"');

    // Install pipenv.
    await pipInstallUser(pipPath, ' pipenv_to_requirements');

    await pipenvInstall(pyUserBase, workPath);
  }

  // eslint-disable-next-line no-param-reassign
  files = await glob('**', workPath);

  if (files[requirementsTxt]) {
    console.log('found local "requirements.txt"');

    const requirementsTxtPath = files[requirementsTxt].fsPath;
    await pipInstall(pipPath, workPath, '-r', requirementsTxtPath);
  } else if (files['requirements.txt']) {
    console.log('found global "requirements.txt"');

    const requirementsTxtPath = files['requirements.txt'].fsPath;
    await pipInstall(pipPath, workPath, '-r', requirementsTxtPath);
  }

  const originalPyPath = path.join(__dirname, 'now_init.py');
  const originalNowHandlerPyContents = await readFile(originalPyPath, 'utf8');

  // will be used on `from $here import handler`
  // for example, `from api.users import handler`
  console.log('entrypoint is', entrypoint);
  const userHandlerFilePath = entrypoint
    .replace(/\//g, '.')
    .replace(/\.py$/, '');
  const nowHandlerPyContents = originalNowHandlerPyContents.replace(
    /__NOW_HANDLER_FILENAME/g,
    userHandlerFilePath,
  );

  // in order to allow the user to have `server.py`, we need our `server.py` to be called
  // somethig else
  const nowHandlerPyFilename = 'now__handler__python';

  await writeFile(
    path.join(workPath, `${nowHandlerPyFilename}.py`),
    nowHandlerPyContents,
  );

  const lambda = await createLambda({
    files: await glob('**', workPath),
    handler: `${nowHandlerPyFilename}.now_handler`,
    runtime: 'python3.6',
    environment: {},
  });

  return {
    [entrypoint]: lambda,
  };
};
