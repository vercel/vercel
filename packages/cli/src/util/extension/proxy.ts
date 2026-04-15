import { createServer } from 'http';
import { Headers } from 'node-fetch';
import type { HeadersInit } from 'node-fetch';
import {
  toOutgoingHeaders,
  mergeIntoServerResponse,
  buildToHeaders,
} from '@edge-runtime/node-utils';
import type { Server } from 'http';
import type Client from '../client';
import { APIError } from '../errors-ts';
import output from '../../output-manager';

const toHeaders = buildToHeaders({
  Headers: Headers as unknown as typeof globalThis.Headers,
});

export function createProxy(client: Client): Server {
  return createServer(async (req, res) => {
    try {
      // Proxy to the upstream Vercel REST API
      const headers = toHeaders(req.headers);
      headers.delete('host');
      const fetchRes = await client.fetch(req.url || '/', {
        headers: headers as unknown as HeadersInit,
        method: req.method,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
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
      fetchRes.body.pipe(res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        // client.fetch throws APIError for non-2xx responses before the
        // `json: false` return path is reached.  Forward the original status
        // and error body so extensions see the real API error instead of 500.
        if (err instanceof APIError) {
          res.statusCode = err.status;
          res.setHeader('Content-Type', 'application/json');

          const errorBody: Record<string, unknown> = {
            message: err.serverMessage,
          };
          // Recover fields that the APIError constructor copied from the
          // response body (code, meta fields, etc.).
          const internal = new Set([
            'message',
            'status',
            'serverMessage',
            'retryAfterMs',
            'stack',
          ]);
          for (const key of Object.keys(err)) {
            if (!internal.has(key)) {
              errorBody[key] = (err as Record<string, unknown>)[key];
            }
          }

          res.end(JSON.stringify({ error: errorBody }));
        } else {
          output.prettyError(err);
          res.statusCode = 500;
          res.end('Unexpected error during API call');
        }
      }
    }
  });
}
