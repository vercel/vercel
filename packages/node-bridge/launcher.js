const { parse } = require('url');
const { createServer, Server } = require('http');
const { Bridge } = require('./bridge.js');

function makeVercelLauncher(config) {
  const {
    entrypointPath,
    bridgePath,
    helpersPath,
    sourcemapSupportPath,
    shouldAddHelpers = false,
    shouldAddSourcemapSupport = false,
  } = config;
  return `
const { parse } = require('url');
const { createServer, Server } = require('http');
const { Bridge } = require(${JSON.stringify(bridgePath)});
${
  shouldAddSourcemapSupport
    ? `require(${JSON.stringify(sourcemapSupportPath)});`
    : ''
}
const entrypointPath = ${JSON.stringify(entrypointPath)};
const shouldAddHelpers = ${JSON.stringify(shouldAddHelpers)};
const helpersPath = ${JSON.stringify(helpersPath)};

const func = (${getVercelLauncher(config).toString()})();
exports.launcher = func.launcher;`;
}

function getVercelLauncher({
  entrypointPath,
  helpersPath,
  shouldAddHelpers = false,
}) {
  return function () {
    const bridge = new Bridge();
    let isServerListening = false;

    const originalListen = Server.prototype.listen;
    Server.prototype.listen = function listen() {
      isServerListening = true;
      console.log('Legacy server listening...');
      bridge.setServer(this);
      Server.prototype.listen = originalListen;
      bridge.listen();
      return this;
    };

    if (!process.env.NODE_ENV) {
      const region = process.env.VERCEL_REGION || process.env.NOW_REGION;
      process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
    }

    import(entrypointPath)
      .then(listener => {
        if (listener.default) listener = listener.default;

        if (typeof listener.listen === 'function') {
          Server.prototype.listen = originalListen;
          const server = listener;
          bridge.setServer(server);
          bridge.listen();
        } else if (typeof listener === 'function') {
          Server.prototype.listen = originalListen;
          if (shouldAddHelpers) {
            bridge.setStoreEvents(true);
            import(helpersPath).then(helper => {
              const server = helper.createServerWithHelpers(listener, bridge);
              bridge.setServer(server);
              bridge.listen();
            });
          } else {
            const server = createServer(listener);
            bridge.setServer(server);
            bridge.listen();
          }
        } else if (
          typeof listener === 'object' &&
          Object.keys(listener).length === 0
        ) {
          setTimeout(() => {
            if (!isServerListening) {
              console.error('No exports found in module %j.', entrypointPath);
              console.error('Did you forget to export a function or a server?');
              process.exit(1);
            }
          }, 5000);
        } else {
          console.error('Invalid export found in module %j.', entrypointPath);
          console.error('The default export must be a function or server.');
        }
      })
      .catch(err => {
        if (err.code === 'MODULE_NOT_FOUND') {
          console.error(err.message);
          console.error(
            'Did you forget to add it to "dependencies" in `package.json`?'
          );
        } else {
          console.error(err);
        }
        process.exit(1);
      });

    return bridge;
  };
}

function makeAwsLauncher(config) {
  const { entrypointPath, awsLambdaHandler = '' } = config;
  return `const url = require("url");
const funcName = ${JSON.stringify(awsLambdaHandler.split('.').pop())};
const entrypointPath = ${JSON.stringify(entrypointPath)};
exports.launcher = ${getAwsLauncher(config)}`;
}

function getAwsLauncher({ entrypointPath, awsLambdaHandler = '' }) {
  const funcName = awsLambdaHandler.split('.').pop();
  if (typeof funcName !== 'string') {
    throw new TypeError('Expected "string"');
  }

  return function (e, context, callback) {
    const { path, method: httpMethod, body, headers } = JSON.parse(e.body);
    const { query } = parse(path, true);
    const queryStringParameters = {};
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        queryStringParameters[key] = value;
      }
    }
    const awsGatewayEvent = {
      resource: '/{proxy+}',
      path: path,
      httpMethod: httpMethod,
      body: body,
      isBase64Encoded: true,
      queryStringParameters: queryStringParameters,
      multiValueQueryStringParameters: query,
      headers: headers,
    };

    const mod = require(entrypointPath);
    return mod[funcName](awsGatewayEvent, context, callback);
  };
}

module.exports = {
  makeVercelLauncher,
  getVercelLauncher,
  makeAwsLauncher,
  getAwsLauncher,
};
