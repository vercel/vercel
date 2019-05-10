const {
  createLambda,
  rename,
  glob,
  download,
  shouldServe,
} = require('@now/build-utils'); // eslint-disable-line import/no-extraneous-dependencies
const path = require('path');
const { getFiles } = require('@now/php-bridge');

exports.config = {
  maxLambdaSize: '10mb',
};

exports.build = async ({
  files, entrypoint, workPath, config, meta,
}) => {
  // Download all files to workPath
  const downloadedFiles = await download(files, workPath, meta);

  let includedFiles = {};
  if (config && config.includeFiles) {
    // Find files for each glob
    // eslint-disable-next-line no-restricted-syntax
    for (const pattern of config.includeFiles) {
      // eslint-disable-next-line no-await-in-loop
      const matchedFiles = await glob(pattern, workPath);
      Object.assign(includedFiles, matchedFiles);
    }
    // explicit and always include the entrypoint
    Object.assign(includedFiles, {
      [entrypoint]: files[entrypoint],
    });
  } else {
    // Backwards compatibility
    includedFiles = downloadedFiles;
  }
  console.log('Included files:', Object.keys(includedFiles));

  const userFiles = rename(includedFiles, name => path.join('user', name));
  const bridgeFiles = await getFiles();

  // TODO config.extensions. OR php.ini from user
  delete bridgeFiles['native/modules/mysqli.so'];
  delete bridgeFiles['native/modules/libmysqlclient.so.16'];

  const lambda = await createLambda({
    files: { ...userFiles, ...bridgeFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10',
    environment: {
      NOW_ENTRYPOINT: entrypoint,
    },
  });

  return { [entrypoint]: lambda };
};

exports.shouldServe = shouldServe;
