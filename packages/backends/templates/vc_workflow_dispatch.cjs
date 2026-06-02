// Runtime workflow dispatcher (CJS). Generated into a Vercel workflow job
// service lambda by `applyWorkflowDispatch` in @vercel/backends. Reads the
// pre-built workflow bundle, initialises the workflow world, and serves the
// queue handler returned by `workflowEntrypoint` and `stepEntrypoint`.
//
// Placeholders replaced at build time:
//   __VC_WORKFLOW_BUNDLE_PATH__  – relative path to the CJS bundle file

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const __vc_bundle_code = readFileSync(
  join(__dirname, '__VC_WORKFLOW_BUNDLE_PATH__'),
  'utf-8'
);

// `workflow/runtime` is ESM-only. Use a dynamic import (supported in CJS
// since Node 14) and cache the handlers promise so it resolves once.
let __vc_handlers_promise;

function getHandlers() {
  if (!__vc_handlers_promise) {
    __vc_handlers_promise = import('workflow/runtime').then(
      ({ createWorld, setWorld, workflowEntrypoint, stepEntrypoint }) => {
        setWorld(createWorld());
        // workflowEntrypoint evaluates the bundle code in a VM context,
        // registering both workflow and step functions. Must be called
        // before stepEntrypoint is used.
        const workflowHandler = workflowEntrypoint(__vc_bundle_code);
        const stepHandler = stepEntrypoint;
        return { workflowHandler, stepHandler };
      }
    );
  }
  return __vc_handlers_promise;
}

/**
 * Adapt the Web API handler to the Node.js (req, res) signature expected by
 * the Vercel Lambda runtime.
 */
module.exports = async function vcWorkflowDispatch(req, res) {
  try {
    const { workflowHandler, stepHandler } = await getHandlers();

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

    const reqInit = {
      method: req.method,
      headers: headers,
      body:
        body && req.method !== 'GET' && req.method !== 'HEAD'
          ? body
          : undefined,
      duplex: 'half',
    };

    // Route to the appropriate handler based on URL path.
    // The platform sends workflow messages to /flow and step messages to /step.
    const handler = url.pathname.endsWith('/step')
      ? stepHandler
      : workflowHandler;

    const webReq = new Request(url.href, reqInit);
    const webRes = await handler(webReq);

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
