import { createServer } from 'http';
import { Readable } from 'stream';
import {
  toOutgoingHeaders,
  mergeIntoServerResponse,
  buildToHeaders,
} from '@edge-runtime/node-utils';
import type { Server } from 'http';
import type Client from '../client';
import output from '../../output-manager';

const toHeaders = buildToHeaders({ Headers });

export function createProxy(client: Client): Server {
  return createServer(async (req, res) => {
    try {
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

      const outgoingHeaders = toOutgoingHeaders(fetchRes.headers);

      delete outgoingHeaders['content-encoding'];
      delete outgoingHeaders['content-length'];

      mergeIntoServerResponse(outgoingHeaders, res);
      if (fetchRes.body) {
        Readable.fromWeb(fetchRes.body as any).pipe(res);
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
