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
