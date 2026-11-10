import { createServer } from 'http';
import { toNodeReadable, type HeadersInit } from '../fetch';
import {
  toOutgoingHeaders,
  mergeIntoServerResponse,
  buildToHeaders,
} from '@edge-runtime/node-utils';
import type { IncomingMessage, Server } from 'http';
import type Client from '../client';
import output from '../../output-manager';

const toHeaders = buildToHeaders({
  Headers: globalThis.Headers,
});

// Browsers send `Origin` or `Sec-Fetch-Site` to loopback; a foreign `Host` means DNS rebinding.
function isBrowserRequest(req: IncomingMessage): boolean {
  if (req.headers.origin !== undefined) {
    return true;
  }
  if (req.headers['sec-fetch-site'] !== undefined) {
    return true;
  }
  return req.headers.host !== `127.0.0.1:${req.socket.localPort}`;
}

// `null` for targets like `//host` or `/\host` that would send the bearer token off the API origin.
function getApiUrl(client: Client, requestTarget: string): string | null {
  if (!requestTarget.startsWith('/')) {
    return null;
  }

  const apiOrigin = new URL(client.apiUrl).origin;
  let url: URL;
  try {
    url = new URL(requestTarget, apiOrigin);
  } catch {
    return null;
  }

  if (url.origin !== apiOrigin) {
    return null;
  }

  // Absolute, so `client.fetch` can't reparse a dot-segment-collapsed `//host` path as a new origin.
  return url.href;
}

export function createProxy(client: Client): Server {
  return createServer(async (req, res) => {
    try {
      if (isBrowserRequest(req)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      const apiUrl = getApiUrl(client, req.url || '/');
      if (apiUrl === null) {
        res.statusCode = 400;
        res.end('Invalid request path');
        return;
      }

      // Proxy to the upstream Vercel REST API
      const headers = toHeaders(req.headers);
      headers.delete('host');
      const fetchRes = await client.fetch(apiUrl, {
        headers: headers as unknown as HeadersInit,
        method: req.method,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
        redirect: 'manual',
        useCurrentTeam: false,
        json: false,
      });
      res.statusCode = fetchRes.status;

      const outgoingHeaders = toOutgoingHeaders(
        fetchRes.headers as unknown as globalThis.Headers
      );

      // Remove content-encoding header because fetch() automatically decompresses
      // the response body but retains the header, which would cause the downstream
      // client to attempt decompression on an already-decompressed stream
      delete outgoingHeaders['content-encoding'];
      delete outgoingHeaders['content-length'];

      mergeIntoServerResponse(outgoingHeaders, res);
      if (fetchRes.body) {
        toNodeReadable(fetchRes.body).pipe(res);
      } else {
        res.end();
      }
    } catch (err: unknown) {
      output.prettyError(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Unexpected error during API call');
      }
    }
  });
}
