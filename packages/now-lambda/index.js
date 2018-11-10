const { Lambda } = require('@now/build-utils/lambda.js');
const path = require('path');

exports.build = async ({ files, entrypoint }) => {
  if (!files[entrypoint]) throw new Error('Entrypoint not found in files');

  // handler=launcher.main!runtime=nodejs8.10!name.zip
  const config = path.basename(entrypoint).split('!').reduce((a, c) => {
    const [ k, v ] = c.split('=');
    if (v) a[k] = v;
    return a;
  }, {});

  if (!config.handler) throw new Error('Handler not found in config');
  if (!config.runtime) throw new Error('Runtime not found in config');

  const lambda = new Lambda({
    zipStream: files[entrypoint].toStream(), // TODO zipBuffer
    handler: config.handler,
    runtime: config.runtime
  });

  return { [entrypoint]: lambda };
};
