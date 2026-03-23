/**
 * Bundled handler for @vercel/node lambdas with experimentalAllowBundling.
 *
 * When the build container groups multiple API route lambdas into one,
 * this handler reads the `x-matched-path` header to determine which
 * entrypoint was matched, then dynamically loads and invokes it.
 */
import { join, resolve, isAbsolute, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { createRequire } from 'module';
import type { IncomingMessage, ServerResponse } from 'http';

const require_ = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const EXTENSIONS = ['.js', '.mjs', '.cjs'];

const handlerCache = new Map<string, any>();

/**
 * Dynamically import a module and unwrap nested default exports
 * (common when TS is transpiled to JS).
 */
async function loadHandler(filePath: string) {
  if (handlerCache.has(filePath)) return handlerCache.get(filePath);

  const id = isAbsolute(filePath)
    ? pathToFileURL(filePath).href
    : filePath;

  let mod = await import(id);
  for (let i = 0; i < 5; i++) {
    if (mod && mod.default) mod = mod.default;
  }

  handlerCache.set(filePath, mod);
  return mod;
}

// The handler lives at ___vc/__handler.mjs, so the Lambda root is one level up.
const LAMBDA_ROOT = resolve(__dirname, '..');

/**
 * Resolve x-matched-path to an actual file on disk.
 * Tries .js, .mjs, .cjs extensions and index files.
 */
function resolveEntrypoint(matchedPath: string): string | null {
  const cleanPath = matchedPath.split('?')[0].replace(/^\/+/, '');

  for (const ext of EXTENSIONS) {
    try {
      return require_.resolve(join(LAMBDA_ROOT, cleanPath + ext));
    } catch {}
  }

  for (const ext of EXTENSIONS) {
    try {
      return require_.resolve(join(LAMBDA_ROOT, cleanPath, 'index' + ext));
    } catch {}
  }

  return null;
}

/**
 * Convert a Web API handler (Request => Response) to a Node.js handler.
 */
async function invokeWebHandler(
  webHandler: (req: Request) => Response | Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse
) {
  const protocol =
    req.headers['x-forwarded-proto'] || 'https';
  const host =
    req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `${protocol}://${host}`);

  const init: RequestInit & { duplex?: string } = {
    method: req.method,
    headers: new Headers(
      Object.fromEntries(
        Object.entries(req.headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      )
    ),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    if (chunks.length > 0) {
      const buf = Buffer.concat(chunks);
      init.body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      init.duplex = 'half';
    }
  }

  const request = new Request(url, init);
  const response = await webHandler(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const matchedPath = req.headers['x-matched-path'] as string | undefined;
  if (!matchedPath) {
    res.statusCode = 400;
    res.end('Missing x-matched-path header');
    return;
  }

  const entrypointPath = resolveEntrypoint(matchedPath);
  if (!entrypointPath) {
    res.statusCode = 404;
    res.end(`No handler found for path: ${matchedPath}`);
    return;
  }

  const entryHandler = await loadHandler(entrypointPath);

  // Traditional function handler: module.exports = (req, res) => {}
  if (typeof entryHandler === 'function') {
    return entryHandler(req, res);
  }

  // Web API exports: export function GET/POST/etc.
  const method = req.method || 'GET';
  if (typeof entryHandler[method] === 'function') {
    return invokeWebHandler(entryHandler[method], req, res);
  }

  // fetch export (e.g., Hono): export function fetch(req) {}
  if (typeof entryHandler.fetch === 'function') {
    return invokeWebHandler(entryHandler.fetch, req, res);
  }

  res.statusCode = 500;
  res.end(`No valid handler exported from ${matchedPath}`);
}
