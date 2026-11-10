import { FileBlob, type Files } from '@vercel/build-utils';
import { basename, dirname, extname, join } from 'node:path';
import { resolveEntrypointAndFormat } from './rolldown/resolve-format.js';

type ModuleFormat = 'esm' | 'cjs';

export async function applyServiceVcInit(args: {
  files: Files;
  handler: string;
  workPath: string;
}): Promise<{ files: Files; handler: string }> {
  const { format, extension } = await resolveShimFormat(args);
  const handlerDir = dirname(args.handler);
  const handlerBaseName = basename(args.handler, extname(args.handler));
  const vcInitName = `${handlerBaseName}.__vc_service_vc_init${extension}`;
  const vcInitHandler =
    handlerDir === '.' ? vcInitName : join(handlerDir, vcInitName);

  const handlerImportPath = `./${basename(args.handler)}`;
  const vcInitSource =
    format === 'esm'
      ? createEsmServiceVcInit(handlerImportPath)
      : createCjsServiceVcInit(handlerImportPath);

  return {
    handler: vcInitHandler,
    files: {
      ...args.files,
      [vcInitHandler]: new FileBlob({
        data: vcInitSource,
        mode: 0o644,
      }),
    },
  };
}

async function resolveShimFormat(args: {
  handler: string;
  workPath: string;
}): Promise<{ format: ModuleFormat; extension: string }> {
  const { format } = await resolveEntrypointAndFormat({
    entrypoint: args.handler,
    workPath: args.workPath,
  });
  const extension =
    extname(args.handler) || (format === 'esm' ? '.mjs' : '.cjs');
  return { format, extension };
}

const sharedShimPrelude = String.raw`
const PATCH_SYMBOL = Symbol.for('vc.service.route-prefix-strip.patch')

function normalizeServiceRoutePrefix(rawPrefix) {
  if (!rawPrefix) {
    return ''
  }

  let prefix = String(rawPrefix).trim()
  if (!prefix) {
    return ''
  }

  if (!prefix.startsWith('/')) {
    prefix = '/' + prefix
  }

  if (prefix !== '/') {
    prefix = prefix.replace(/\/+$/, '')
  }

  return prefix === '/' ? '' : prefix
}

function getServiceRoutePrefix() {
  const enabled = String(
    process.env.VERCEL_SERVICE_ROUTE_PREFIX_STRIP || ''
  ).toLowerCase()
  if (enabled !== '1' && enabled !== 'true') {
    return ''
  }

  return normalizeServiceRoutePrefix(process.env.VERCEL_SERVICE_ROUTE_PREFIX || '')
}

function stripServiceRoutePrefix(requestUrl, prefix) {
  if (typeof requestUrl !== 'string' || requestUrl === '*') {
    return requestUrl
  }

  const queryIndex = requestUrl.indexOf('?')
  const rawPath =
    queryIndex === -1 ? requestUrl : requestUrl.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : requestUrl.slice(queryIndex)

  let path = rawPath || '/'
  if (!path.startsWith('/')) {
    path = '/' + path
  }

  if (!prefix) {
    return path + query
  }

  if (path === prefix) {
    return '/' + query
  }

  if (path.startsWith(prefix + '/')) {
    return path.slice(prefix.length) + query
  }

  return path + query
}

function patchServerRequestUrl(ServerCtor) {
  const prefix = getServiceRoutePrefix()
  if (!prefix || globalThis[PATCH_SYMBOL]) {
    return
  }

  globalThis[PATCH_SYMBOL] = true

  const originalEmit = ServerCtor.prototype.emit
  ServerCtor.prototype.emit = function patchedEmit(event, request, ...args) {
    if (event === 'request' && request && typeof request.url === 'string') {
      request.url = stripServiceRoutePrefix(request.url, prefix)
    }

    return originalEmit.call(this, event, request, ...args)
  }
}
`;

function createEsmServiceVcInit(handlerImportPath: string): string {
  return `
import { Server } from 'node:http'

${sharedShimPrelude}

// Patch the HTTP server before loading user code so apps that attach request
// listeners during module evaluation see the stripped service-relative URL.
patchServerRequestUrl(Server)

const originalModule = await import(${JSON.stringify(handlerImportPath)})

/**
 * Match the Node serverless loader behavior: TS/CJS/ESM interop can leave us
 * with nested \`.default\` wrappers, so peel off a few layers to recover the
 * actual user entrypoint shape.
 */
function unwrapDefaultExport(value) {
  let current = value
  for (let i = 0; i < 5; i++) {
    if (current && typeof current === 'object' && 'default' in current && current.default) {
      current = current.default
    } else {
      break
    }
  }
  return current
}

const entrypoint = unwrapDefaultExport(originalModule)

// Re-export the resolved entrypoint so the surrounding runtime still sees the
// same handler shape after this service bootstrap runs.
export default typeof entrypoint === 'undefined' ? originalModule : entrypoint
`.trimStart();
}

function createCjsServiceVcInit(handlerImportPath: string): string {
  return `
const { Server } = require('node:http')

${sharedShimPrelude}

patchServerRequestUrl(Server)

module.exports = require(${JSON.stringify(handlerImportPath)})
`.trimStart();
}
