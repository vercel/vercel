const Module = require('module');
const fs = require('fs');
const path = require('path');

const originalRequire = Module.prototype.require;
let isInstrumenting = false;
let app = null;
let staticPaths = [];
let views = '';
let viewEngine = '';
const routes = {};

console.log('[@vercel/express] Loader initialized');

Module.prototype.require = function (id) {
  const result = originalRequire.apply(this, arguments);

  // Check if the result is Express (works for both 'express' and resolved paths)
  if (
    !isInstrumenting &&
    typeof result === 'function' &&
    result.application &&
    result.Router &&
    result.static
  ) {
    console.log('[@vercel/express] Intercepting express (id:', id, ')');
    isInstrumenting = true;
    try {
      const originalExpress = result;

      // Wrap express.static to capture static paths
      const originalStatic = originalExpress.static;
      originalExpress.static = (...args) => {
        staticPaths.push(args[0]);
        return originalStatic(...args);
      };

      // eslint-disable-next-line no-inner-declarations
      function expressWrapper() {
        app = originalExpress.apply(this, arguments);
        return app;
      }

      // Copy all properties from the original express to the wrapper
      Object.setPrototypeOf(expressWrapper, originalExpress);
      Object.assign(expressWrapper, originalExpress);
      expressWrapper.prototype = originalExpress.prototype;

      // Set up extraction on process exit
      setupExtraction();

      return expressWrapper;
    } finally {
      isInstrumenting = false;
    }
  }

  return result;
};

let routesExtracted = false;

const extractRoutes = () => {
  if (routesExtracted) {
    return;
  }
  routesExtracted = true;

  const methods = [
    'all',
    'get',
    'post',
    'put',
    'delete',
    'patch',
    'options',
    'head',
  ];
  if (!app) {
    return;
  }
  const router = app._router || app.router;
  for (const route of router.stack) {
    if (route.route) {
      const m = [];
      for (const method of methods) {
        if (route.route.methods[method]) {
          m.push(method.toUpperCase());
        }
      }
      routes[route.route.path] = { methods: m };
    }
  }

  views = app.settings.views;
  viewEngine = app.settings['view engine'];

  // Ensure directory exists
  const introspectionPath = process.env.VERCEL_EXPRESS_INTROSPECTION_PATH;
  if (introspectionPath) {
    const dir = path.dirname(introspectionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      introspectionPath,
      JSON.stringify({ routes, views, staticPaths, viewEngine }, null, 2)
    );
  }
};

let extractionSetup = false;

const setupExtraction = () => {
  if (extractionSetup) {
    return;
  }
  extractionSetup = true;

  process.on('exit', () => {
    extractRoutes();
  });

  process.on('SIGINT', () => {
    extractRoutes();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    extractRoutes();
    process.exit(0);
  });
};
