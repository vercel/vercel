const { parse, pathToFileURL } = require('url');
const { createServer, Server } = require('http');
const { isAbsolute } = require('path');
const { Bridge } = require('./bridge.js');

/**
 * @param {import('./types').LauncherConfiguration} config
 */
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
const { parse, pathToFileURL } = require('url');
const { createServer, Server } = require('http');
const { isAbsolute } = require('path');
const { Bridge } = require(${JSON.stringify(bridgePath)});
${
  shouldAddSourcemapSupport
    ? `require(${JSON.stringify(sourcemapSupportPath)});`
    : ''
}
const entrypointPath = ${JSON.stringify(entrypointPath)};
const shouldAddHelpers = ${JSON.stringify(shouldAddHelpers)};
const helpersPath = ${JSON.stringify(helpersPath)};
const useRequire = false;

const func = (${getVercelLauncher(config).toString()})();
exports.launcher = func.launcher;`;
}

/**
 * @param {import('./types').LauncherConfiguration} config
 */
function getVercelLauncher({
  entrypointPath,
  helpersPath,
  shouldAddHelpers = false,
  useRequire = false,
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

    /**
     * @param {string} p - entrypointPath
     */
    async function getListener(p) {
      let listener = useRequire
        ? require(p)
        : await import(isAbsolute(p) ? pathToFileURL(p).href : p);

      // In some cases we might have nested default props due to TS => JS
      for (let i = 0; i < 5; i++) {
        if (listener.default) listener = listener.default;
      }

      return listener;
    }

    getListener(entrypointPath)
      .then(listener => {
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
              const h = helper.default || helper;
              const server = h.createServerWithHelpers(listener, bridge);
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

/**
 * @param {import('./types').LauncherConfiguration} config
 */
function makeAwsLauncher(config) {
  const { entrypointPath, awsLambdaHandler = '' } = config;
  return `const { parse } = require("url");
const funcName = ${JSON.stringify(awsLambdaHandler.split('.').pop())};
const entrypointPath = ${JSON.stringify(entrypointPath)};
exports.launcher = ${getAwsLauncher(config).toString()}`;
}

/**
 * @param {import('./types').LauncherConfiguration} config
 */
function getAwsLauncher({ entrypointPath, awsLambdaHandler = '' }) {
  const funcName = awsLambdaHandler.split('.').pop() || '';
  if (typeof funcName !== 'string') {
    throw new TypeError('Expected "string"');
  }

  /**
   * @param {import('aws-lambda').APIGatewayProxyEvent} e
   * @param {import('aws-lambda').Context} context
   * @param {() => void} callback
   */
  function internal(e, context, callback) {
    const {
      path,
      method: httpMethod,
      body,
      headers,
    } = JSON.parse(e.body || '{}');
    const { query } = parse(path, true);
    /**
     * @type {{[key: string]: string}}
     */
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
  }
  return internal;
}

module.exports = {
  makeVercelLauncher,
  getVercelLauncher,
  makeAwsLauncher,
  getAwsLauncher,
};
