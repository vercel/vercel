const execa = require('execa');
const { join } = require('path');
const snakeCase = require('snake-case');
const glob = require('@now/build-utils/fs/glob'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download'); // eslint-disable-line import/no-extraneous-dependencies
const { createLambda } = require('@now/build-utils/lambda'); // eslint-disable-line import/no-extraneous-dependencies
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory'); // eslint-disable-line import/no-extraneous-dependencies

exports.config = {
  maxLambdaSize: '10mb',
};

exports.analyze = ({ files, entrypoint }) => files[entrypoint].digest;

exports.build = async ({ files, entrypoint, config }) => {
  const srcDir = await getWritableDirectory();
  const workDir = await getWritableDirectory();

  console.log('downloading files...');
  await download(files, srcDir);

  const configEnv = Object.keys(config).reduce((o, v) => {
    o[`IMPORT_${snakeCase(v).toUpperCase()}`] = config[v]; // eslint-disable-line no-param-reassign
    return o;
  }, {});

  const IMPORT_CACHE = `${workDir}/.import-cache`;
  const env = Object.assign({}, process.env, configEnv, {
    PATH: `${IMPORT_CACHE}/bin:${process.env.PATH}`,
    IMPORT_CACHE,
    SRC: srcDir,
    BUILDER: __dirname,
    ENTRYPOINT: entrypoint,
  });

  const builderPath = join(__dirname, 'builder.sh');

  await execa(builderPath, [entrypoint], {
    env,
    cwd: workDir,
    stdio: 'inherit',
  });

  const lambda = await createLambda({
    files: await glob('**', workDir),
    handler: entrypoint, // not actually used in `bootstrap`
    runtime: 'provided',
    environment: Object.assign({}, configEnv, {
      SCRIPT_FILENAME: entrypoint,
    }),
  });

  return {
    [entrypoint]: lambda,
  };
};
