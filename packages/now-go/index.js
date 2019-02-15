const { join, dirname } = require('path');
const { readFile, writeFile } = require('fs-extra');

const glob = require('@now/build-utils/fs/glob.js'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download.js'); // eslint-disable-line import/no-extraneous-dependencies
const { createLambda } = require('@now/build-utils/lambda.js'); // eslint-disable-line import/no-extraneous-dependencies
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory.js'); // eslint-disable-line import/no-extraneous-dependencies
const { createGo, getExportedFunctionName } = require('./go-helpers');

const config = {
  maxLambdaSize: '10mb',
};

async function build({ files, entrypoint }) {
  console.log('Downloading user files...');

  const [goPath, outDir] = await Promise.all([
    getWritableDirectory(),
    getWritableDirectory(),
  ]);

  const srcPath = join(goPath, 'src', 'lambda');
  const downloadedFiles = await download(files, srcPath);

  console.log(`Parsing AST for "${entrypoint}"`);
  let handlerFunctionName;
  try {
    handlerFunctionName = await getExportedFunctionName(
      downloadedFiles[entrypoint].fsPath,
    );
  } catch (err) {
    console.log(`Failed to parse AST for "${entrypoint}"`);
    throw err;
  }

  if (!handlerFunctionName) {
    const err = new Error(
      `Could not find an exported function in "${entrypoint}"`,
    );
    console.log(err.message);
    throw err;
  }

  console.log(
    `Found exported function "${handlerFunctionName}" in "${entrypoint}"`,
  );

  const origianlMainGoContents = await readFile(
    join(__dirname, 'main.go'),
    'utf8',
  );
  const mainGoContents = origianlMainGoContents.replace(
    '__NOW_HANDLER_FUNC_NAME',
    handlerFunctionName,
  );
  // in order to allow the user to have `main.go`, we need our `main.go` to be called something else
  const mainGoFileName = 'main__now__go__.go';

  // we need `main.go` in the same dir as the entrypoint,
  // otherwise `go build` will refuse to build
  const entrypointDirname = dirname(downloadedFiles[entrypoint].fsPath);

  // Go doesn't like to build files in different directories,
  // so now we place `main.go` together with the user code
  await writeFile(join(entrypointDirname, mainGoFileName), mainGoContents);

  const go = await createGo(goPath, process.platform, process.arch, {
    cwd: entrypointDirname,
  });

  // `go get` will look at `*.go` (note we set `cwd`), parse the `import`s
  // and download any packages that aren't part of the stdlib
  try {
    await go.get();
  } catch (err) {
    console.log('failed to `go get`');
    throw err;
  }

  console.log('Running `go build`...');
  const destPath = join(outDir, 'handler');
  try {
    const src = [
      join(entrypointDirname, mainGoFileName),
      downloadedFiles[entrypoint].fsPath,
    ];
    await go.build({ src, dest: destPath });
  } catch (err) {
    console.log('failed to `go build`');
    throw err;
  }

  const lambda = await createLambda({
    files: await glob('**', outDir),
    handler: 'handler',
    runtime: 'go1.x',
    environment: {},
  });

  return {
    [entrypoint]: lambda,
  };
}

module.exports = { config, build };
