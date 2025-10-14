import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);

  if (url.includes('node_modules/express') && url.includes('index.js')) {
    const filePath = fileURLToPath(url);

    const modifiedSource = modifySource(filePath); // Add your modifications

    return {
      format: 'commonjs',
      source: modifiedSource,
      // Don't continue loading the original source
      shortCircuit: true,
    };
  }

  return result;
}

const modifySource = () => {
  return `
  const fs = require('fs');
const path = require('path');
const originalExpress = require('./lib/express');

let app = null
let staticPaths = [];
let views = ''
let viewEngine = ''
const routes = {};
const originalStatic = originalExpress.static
originalExpress.static = (...args) => {
  staticPaths.push(args[0]);
  return originalStatic(...args);
}
function expressWrapper() {
  app = originalExpress.apply(this, arguments);
  app.listen = (...args) => {
    // noop to prevent the original listen method from being called
  }
  return app;
}

// Copy all properties from the original express to the wrapper
Object.setPrototypeOf(expressWrapper, originalExpress);
Object.assign(expressWrapper, originalExpress);

// Preserve the original prototype
expressWrapper.prototype = originalExpress.prototype;

module.exports = expressWrapper;

let routesExtracted = false;

const extractRoutes = () => {
  if (routesExtracted) {
    return;
  }
  routesExtracted = true;

  const methods = ["all", "get", "post", "put", "delete", "patch", "options", "head"]
  if (!app) {
    return;
  }
  const router = app._router || app.router
  for (const route of router.stack) {
    if(route.route) {
      const m = [];
      for (const method of methods) {
        if(route.route.methods[method]) {
          m.push(method.toUpperCase());
        }
      }
      routes[route.route.path] = { methods: m };
    }
  }

  views = app.settings.views
  viewEngine = app.settings['view engine']

  // Ensure directory exists
  const introspectionPath = process.env.VERCEL_EXPRESS_INTROSPECTION_PATH;
  const dir = path.dirname(introspectionPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(introspectionPath, JSON.stringify({routes, views, staticPaths, viewEngine}, null, 2));
}

process.on('exit', () => {
  extractRoutes()
});

process.on('SIGINT', () => {
  extractRoutes()
  process.exit(0);
});
// Write routes to file on SIGTERM
process.on('SIGTERM', () => {
  extractRoutes()
  process.exit(0);
});
`;
};
