// Runtime workflow dispatcher (ESM). Generated into a Vercel workflow job
// service lambda by `applyWorkflowDispatch` in @vercel/backends. Reads the
// pre-built workflow bundle, initialises the workflow world, and serves the
// queue handler returned by `workflowEntrypoint`.
//
// Placeholders replaced at build time:
//   __VC_WORKFLOW_BUNDLE_PATH__   – relative path to the CJS bundle file
//   __VC_WORKFLOW_RUNTIME_PATH__  – relative path to the bundled runtime

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __vc_dirname = dirname(fileURLToPath(import.meta.url));
const __vc_bundle_code = readFileSync(
  join(__vc_dirname, '__VC_WORKFLOW_BUNDLE_PATH__'),
  'utf-8'
);

// Load the pre-bundled workflow runtime (CJS). This avoids depending on
// node_modules being present in the lambda.
const __vc_require = createRequire(import.meta.url);
const {
  createWorld,
  setWorld,
  workflowEntrypoint,
} = __vc_require(join(__vc_dirname, '__VC_WORKFLOW_RUNTIME_PATH__'));

// Initialise the workflow world (picks Vercel or local based on env).
setWorld(createWorld());

// `workflowEntrypoint` evaluates the bundle in a VM context and returns a
// Web-API-style handler: (Request) => Promise<Response>.
const __vc_handler = workflowEntrypoint(__vc_bundle_code);

/**
 * Adapt the Web API handler to the Node.js (req, res) signature expected by
 * the Vercel Lambda runtime.
 */
export default async function vcWorkflowDispatch(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `${protocol}://${host}`);

    // Collect the request body.
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value != null)
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }

    const webReq = new Request(url.href, {
      method: req.method,
      headers,
      body:
        body && req.method !== 'GET' && req.method !== 'HEAD'
          ? body
          : undefined,
      // Node 18+ requires duplex for streams; a Buffer is fine without it,
      // but set it defensively.
      duplex: 'half',
    });

    const webRes = await __vc_handler(webReq);

    res.statusCode = webRes.status;
    for (const [key, value] of webRes.headers.entries()) {
      res.setHeader(key, value);
    }

    // Stream the response body if present.
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
}
