import { createServer } from 'http';
import {
  toOutgoingHeaders,
  mergeIntoServerResponse,
  buildToHeaders,
} from '@edge-runtime/node-utils';
import type { Server } from 'http';
import type Client from '../client';
import { toNodeReadable } from '../web-stream';
import output from '../../output-manager';

const toHeaders = buildToHeaders({ Headers });

export function createProxy(client: Client): Server {
  return createServer(async (req, res) => {
    try {
      // Proxy to the upstream Vercel REST API
      const headers = toHeaders(req.headers);
      headers.delete('host');
      const fetchRes = await client.fetch(req.url || '/', {
        headers: headers as RequestInit['headers'],
        method: req.method,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
        useCurrentTeam: false,
        json: false,
      });
      res.statusCode = fetchRes.status;

      const outgoingHeaders = toOutgoingHeaders(fetchRes.headers);

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
