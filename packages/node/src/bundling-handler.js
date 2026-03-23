//
// Unified Lambda handler for bundled vanilla API routes.
// All bundleable lambdas share this exact file (same handler digest).
// It reads x-matched-path to determine which entrypoint to invoke.
//
// IMPORTANT: This file must remain entrypoint-agnostic. Do not embed
// any path-specific constants. The x-matched-path header is set by
// route rules injected by the builder.
//
// This runs at Lambda runtime where the handler is invoked with (req, res).
// User modules are in the Lambda's file tree alongside this file.

const handlerCache = Object.create(null);

module.exports = (req, res) => {
  const matchedPath = req.headers['x-matched-path'];
  if (typeof matchedPath !== 'string' || !matchedPath) {
    res.statusCode = 500;
    res.end(
      'Missing x-matched-path header. The bundled handler requires route-level header injection.'
    );
    return;
  }

  const entrypoint = matchedPath.replace(/^\//, '');

  if (!handlerCache[entrypoint]) {
    let mod = require('./' + entrypoint);
    // Unwrap default exports (TS/ESM compiled to CJS pattern)
    if (mod && mod.default && typeof mod.default === 'function') {
      mod = mod.default;
    }
    if (typeof mod !== 'function') {
      res.statusCode = 500;
      res.end('Handler for ' + entrypoint + ' does not export a function');
      return;
    }
    handlerCache[entrypoint] = mod;
  }

  return handlerCache[entrypoint](req, res);
};
