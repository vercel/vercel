const { Lambda } = require('@now/build-utils/lambda.js');
const path = require('path');
const streamToBuffer = require('@now/build-utils/fs/stream-to-buffer.js');

exports.build = async ({ files, entrypoint }) => {
  if (!files[entrypoint]) throw new Error('Entrypoint not found in files');

  // handler=launcher.main!runtime=nodejs8.10!name.zip
  const config = path.basename(entrypoint).split('!').reduce((a, c) => {
    const [k, v] = c.split('=');
    // eslint-disable-next-line no-param-reassign
    if (v) a[k] = v;
    return a;
  }, {});

  if (!config.handler) throw new Error('Handler not found in config');
  if (!config.runtime) throw new Error('Runtime not found in config');

  const zipBuffer = await streamToBuffer(files[entrypoint].toStream());

  const lambda = new Lambda({
    zipBuffer,
    handler: config.handler,
    runtime: config.runtime,
  });

  return { [entrypoint]: lambda };
};
