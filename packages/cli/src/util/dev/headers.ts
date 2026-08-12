import { Headers } from '../fetch';
import type {
  IncomingHttpHeaders,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http';

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
 * Response headers that must stay as separate lines. Their values can
 * contain commas of their own, such as a cookie's `Expires` or an auth
 * challenge's params, so combining them is unsafe.
 */
const NEVER_COMBINE_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  'set-cookie',
  'www-authenticate',
  'proxy-authenticate',
]);

/**
 * Response headers that accumulate instead of overwriting. `vary` is the
 * practical case. Each middleware may add its own cache-varying header
 * name.
 */
const COMMA_JOIN_RESPONSE_HEADERS: ReadonlySet<string> = new Set(['vary']);

/**
 * Applies one response header from a middleware onto `res`. Join-style
 * headers above accumulate across the chain instead of being overwritten
 * by a later middleware. Everything else is last-write-wins.
 * `name` is expected lowercased.
 */
export function applyChainResponseHeader(
  res: Pick<ServerResponse, 'getHeader' | 'setHeader'>,
  name: string,
  value: string
): void {
  if (NEVER_COMBINE_RESPONSE_HEADERS.has(name)) {
    const existing = res.getHeader(name);
    const values: string[] = Array.isArray(existing)
      ? existing.map(String)
      : existing !== undefined
        ? [String(existing)]
        : [];
    values.push(value);
    res.setHeader(name, values);
    return;
  }

  if (COMMA_JOIN_RESPONSE_HEADERS.has(name)) {
    const existing = res.getHeader(name);
    res.setHeader(
      name,
      existing !== undefined ? `${existing}, ${value}` : value
    );
    return;
  }

  res.setHeader(name, value);
}

/**
 * Request headers that are not allowed to be overridden by a middleware.
 */
const NONOVERRIDABLE_HEADERS: Set<string> = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'trailer',
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
 * Returns a mutable copy of `respHeaders` with the middleware control headers
 * removed so it can be safely forwarded.
 *
 */
export function applyOverriddenHeaders(
  reqHeaders: { [k: string]: string | string[] | undefined },
  respHeaders: Headers
) {
  // Headers from a native fetch network response are immutable. Work with a
  // mutable copy because the middleware control headers must be removed before
  // the remaining response headers are forwarded to the request and client.
  const headers = new Headers(respHeaders);
  const overriddenHeaders = headers.get('x-middleware-override-headers');
  if (!overriddenHeaders) {
    return headers;
  }

  const overriddenKeys: Set<string> = new Set();
  for (const key of overriddenHeaders.split(',')) {
    overriddenKeys.add(key.trim());
  }

  headers.delete('x-middleware-override-headers');

  // Delete headers.
  for (const key of Object.keys(reqHeaders)) {
    if (!NONOVERRIDABLE_HEADERS.has(key) && !overriddenKeys.has(key)) {
      delete reqHeaders[key];
    }
  }

  // Update or add headers.
  for (const key of overriddenKeys.keys()) {
    if (NONOVERRIDABLE_HEADERS.has(key)) {
      continue;
    }

    const valueKey = 'x-middleware-request-' + key;
    const newValue = headers.get(valueKey);
    const oldValue = reqHeaders[key];

    if (oldValue !== newValue) {
      if (newValue) {
        reqHeaders[key] = newValue;
      } else {
        delete reqHeaders[key];
      }
    }

    headers.delete(valueKey);
  }

  return headers;
}
