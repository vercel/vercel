// Runtime workflow dispatcher (CJS). Generated into a Vercel workflow job
// service lambda by `applyWorkflowDispatch` in @vercel/backends. Reads the
// pre-built workflow bundle, initialises the workflow world, and serves the
// queue handler returned by `workflowEntrypoint`.
//
// Placeholders replaced at build time:
//   __VC_WORKFLOW_BUNDLE_PATH__   – relative path to the CJS bundle file
//   __VC_WORKFLOW_RUNTIME_PATH__  – relative path to the bundled runtime

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const __vc_bundle_code = readFileSync(
  join(__dirname, '__VC_WORKFLOW_BUNDLE_PATH__'),
  'utf-8'
);

// Load the pre-bundled workflow runtime (CJS). This avoids depending on
// node_modules being present in the lambda — the runtime and all its
// dependencies are bundled at build time by rolldown.
const {
  createWorld,
  setWorld,
  workflowEntrypoint,
} = require(join(__dirname, '__VC_WORKFLOW_RUNTIME_PATH__'));

setWorld(createWorld());
const __vc_handler = workflowEntrypoint(__vc_bundle_code);

/**
 * Adapt the Web API handler to the Node.js (req, res) signature expected by
 * the Vercel Lambda runtime.
 */
module.exports = async function vcWorkflowDispatch(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', protocol + '://' + host);

    // Collect the request body.
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const headers = {};
    const keys = Object.keys(req.headers);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = req.headers[key];
      if (value != null)
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }

    const webReq = new Request(url.href, {
      method: req.method,
      headers: headers,
      body:
        body && req.method !== 'GET' && req.method !== 'HEAD'
          ? body
          : undefined,
      duplex: 'half',
    });

    const webRes = await __vc_handler(webReq);

    res.statusCode = webRes.status;
    for (const [key, value] of webRes.headers.entries()) {
      res.setHeader(key, value);
    }

    if (webRes.body) {
      const reader = webRes.body.getReader();
      try {
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          res.write(chunk);
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (err) {
    console.error('[workflow dispatch]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify({ error: 'internal' }));
  }
};
