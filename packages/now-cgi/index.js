const path = require('path');
const { mkdirp, copyFile } = require('fs-extra');

const glob = require('@now/build-utils/fs/glob'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download'); // eslint-disable-line import/no-extraneous-dependencies
const { createLambda } = require('@now/build-utils/lambda'); // eslint-disable-line import/no-extraneous-dependencies
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory'); // eslint-disable-line import/no-extraneous-dependencies

exports.analyze = ({ files, entrypoint }) => files[entrypoint].digest;

exports.build = async ({ files, entrypoint }) => {
  console.log('downloading files...');
  const srcDir = await getWritableDirectory();
  const outDir = await getWritableDirectory();

  await download(files, srcDir);

  const handlerPath = path.join(__dirname, 'handler');
  await copyFile(handlerPath, path.join(outDir, 'handler'));

  const entrypointOutDir = path.join(outDir, path.dirname(entrypoint));
  await mkdirp(entrypointOutDir);

  // For now only the entrypoint file is copied into the lambda
  await copyFile(
    path.join(srcDir, entrypoint),
    path.join(outDir, entrypoint),
  );

  const lambda = await createLambda({
    files: await glob('**', outDir),
    handler: 'handler',
    runtime: 'go1.x',
    environment: {
      SCRIPT_FILENAME: entrypoint,
    },
  });

  return {
    [entrypoint]: lambda,
  };
};
