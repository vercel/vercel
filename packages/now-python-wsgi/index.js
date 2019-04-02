const path = require('path');
const execa = require('execa');
const { readFile, writeFile } = require('fs.promised');
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory.js');
const download = require('@now/build-utils/fs/download.js');
const glob = require('@now/build-utils/fs/glob.js');
const { createLambda } = require('@now/build-utils/lambda.js');
const downloadAndInstallPip = require('./download-and-install-pip');

async function pipInstall(pipPath, srcDir, ...args) {
  console.log(`running "pip install -t ${srcDir} ${args.join(' ')}"...`);
  try {
    await execa(pipPath, ['install', '-t', srcDir, ...args], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.log(`failed to run "pip install -t ${srcDir} ${args.join(' ')}"`);
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
  process.chdir(srcDir);
  try {
    await execa(
      path.join(pyUserBase, 'bin', 'pipenv_to_requirements'),
      ['-f'],
      { stdio: 'inherit' },
    );
  } catch (err) {
    console.log('failed to run "pipenv_to_requirements -f"');
    throw err;
  }
}

exports.config = {
  maxLambdaSize: '5mb',
};

exports.build = async ({ files, entrypoint, config }) => {
  console.log('downloading files...');

  const srcDir = await getWritableDirectory();

  // eslint-disable-next-line no-param-reassign
  files = await download(files, srcDir);

  // this is where `pip` will be installed to
  // we need it to be under `/tmp`
  const pyUserBase = await getWritableDirectory();
  process.env.PYTHONUSERBASE = pyUserBase;

  const pipPath = await downloadAndInstallPip();

  await pipInstall(pipPath, srcDir, 'werkzeug');

  if (files['Pipfile.lock']) {
    console.log('found "Pipfile.lock"');

    // Install pipenv.
    await pipInstallUser(pipPath, ' pipenv_to_requirements');

    await pipenvInstall(pyUserBase, srcDir);
  }

  // eslint-disable-next-line no-param-reassign
  files = await glob('**', srcDir);

  if (files['requirements.txt']) {
    console.log('found "requirements.txt"');

    const requirementsTxtPath = files['requirements.txt'].fsPath;
    await pipInstall(pipPath, srcDir, '-r', requirementsTxtPath);
  }

  const originalNowHandlerPyContents = await readFile(
    path.join(__dirname, 'now_handler.py'),
    'utf8',
  );
  // will be used on `from $here import handler`
  // for example, `from api.users import handler`
  console.log('entrypoint is', entrypoint);
  const userHandlerFilePath = entrypoint
    .replace(/\//g, '.')
    .replace(/\.py$/, '');
  const nowHandlerPyContents = originalNowHandlerPyContents.replace(
    '__NOW_HANDLER_FILENAME',
    userHandlerFilePath,
  );

  // in order to allow the user to have `server.py`, we need our `server.py` to be called
  // somethig else
  const nowHandlerPyFilename = 'now__handler__python';

  await writeFile(
    path.join(srcDir, `${nowHandlerPyFilename}.py`),
    nowHandlerPyContents,
  );

  const lambda = await createLambda({
    files: await glob('**', srcDir),
    handler: `${nowHandlerPyFilename}.now_handler`,
    runtime: `python${config.python || '3.6'}`,
    environment: {},
  });

  return {
    [entrypoint]: lambda,
  };
};
