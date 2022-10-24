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
 * Headers listed in `skippedHeaders` will be ignored.
 *
 */
export function applyOverriddenHeaders(
  reqHeaders: { [k: string]: string | string[] | undefined },
  respHeaders: Headers,
  skippedHeaders: Set<string>
) {
  if (!respHeaders.has('x-middleware-override-headers')) {
    return;
  }

  const overriddenHeaders: Set<string> = new Set();
  for (const key of respHeaders
    .get('x-middleware-override-headers')!
    .split(',')) {
    overriddenHeaders.add(key.trim());
  }

  respHeaders.delete('x-middleware-override-headers');

  // Delete headers.
  for (const key of Object.keys(reqHeaders)) {
    if (!overriddenHeaders.has(key)) {
      delete reqHeaders[key];
    }
  }

  // Update or add headers.
  for (const key of overriddenHeaders.keys()) {
    if (skippedHeaders.has(key)) {
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
