import { Headers } from 'node-fetch';
import { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';

export function nodeHeadersToFetchHeaders(
  nodeHeaders: IncomingHttpHeaders | OutgoingHttpHeaders
): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const val of value) {
        headers.append(name, val);
      }
    } else if (typeof value !== 'undefined') {
      headers.set(name, String(value));
    }
  }
  return headers;
}

/**
 * Request headers that are not allowed to be overridden by a middleware.
 * These headers are protected to prevent security vulnerabilities including SSRF attacks.
 */
const NONOVERRIDABLE_HEADERS: Set<string> = new Set([
  // Basic HTTP protocol headers
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'te',
  'upgrade',
  'trailer',
  
  // Security-sensitive headers to prevent SSRF and other attacks
  'authorization',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-real-ip',
  'x-client-ip',
  'x-original-forwarded-for',
  'x-cluster-client-ip',
  'forwarded',
  'via',
  'true-client-ip',
  'cf-connecting-ip',
  'fastly-client-ip',
  
  // Vercel-specific internal headers
  'x-vercel-deployment-url',
  'x-vercel-forwarded-for',
  'x-vercel-id',
  'x-vercel-cache',
  'x-vercel-edge',
]);

/**
 * Adds/Updates/Deletes headers in `reqHeaders` based on the response headers
 * from a middleware (`respHeaders`).
 *
 * `x-middleware-override-headers` is a comma-separated list of *all* header
 * names that should appear in new request headers. Names not in this list
 * will be deleted.
 *
 * `x-middleware-request-*` is the new value for each header. This can't be
 * omitted, even if the header is not being modified.
 * 
 * Security: Headers in NONOVERRIDABLE_HEADERS are protected from modification
 * to prevent SSRF attacks and other security vulnerabilities.
 *
 */
export function applyOverriddenHeaders(
  reqHeaders: { [k: string]: string | string[] | undefined },
  respHeaders: Headers
) {
  const overriddenHeaders = respHeaders.get('x-middleware-override-headers');
  if (!overriddenHeaders) {
    return;
  }

  const overriddenKeys: Set<string> = new Set();
  for (const key of overriddenHeaders.split(',')) {
    overriddenKeys.add(key.trim());
  }

  respHeaders.delete('x-middleware-override-headers');

  // Delete headers.
  for (const key of Object.keys(reqHeaders)) {
    if (!NONOVERRIDABLE_HEADERS.has(key.toLowerCase()) && !overriddenKeys.has(key)) {
      delete reqHeaders[key];
    }
  }

  // Update or add headers.
  for (const key of overriddenKeys.keys()) {
    if (NONOVERRIDABLE_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    const valueKey = 'x-middleware-request-' + key;
    const newValue = respHeaders.get(valueKey);
    const oldValue = reqHeaders[key];

    if (oldValue !== newValue) {
      if (newValue) {
        reqHeaders[key] = newValue;
      } else {
        delete reqHeaders[key];
      }
    }

    respHeaders.delete(valueKey);
  }
}
