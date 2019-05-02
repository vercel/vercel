const { Lambda } = require('@now/build-utils/lambda.js'); // eslint-disable-line import/no-extraneous-dependencies
const streamToBuffer = require('@now/build-utils/fs/stream-to-buffer.js'); // eslint-disable-line import/no-extraneous-dependencies
const { shouldServe } = require('@now/build-utils'); // eslint-disable-line import/no-extraneous-dependencies

exports.build = async ({ files, entrypoint, config }) => {
  if (!files[entrypoint]) throw new Error('Entrypoint not found in files');
  const { handler, runtime } = config;
  if (!handler) throw new Error('Handler not found in config');
  if (!runtime) throw new Error('Runtime not found in config');
  const zipBuffer = await streamToBuffer(files[entrypoint].toStream());
  const lambda = new Lambda({ zipBuffer, handler, runtime });
  return { [entrypoint]: lambda };
};

exports.shouldServe = shouldServe;
