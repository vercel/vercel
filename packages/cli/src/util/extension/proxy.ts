import { once } from 'events';
import httpProxy from 'http-proxy';
import { createServer, Server } from 'http';
import type Client from '../client';

export function createProxy(
  client: Client,
  apiUrl: string,
  token?: string
): Server {
  const { time } = client.output;

  const proxy = httpProxy.createProxyServer({
    target: apiUrl,
    changeOrigin: true,
  });

  const server = createServer((req, res) => {
    const requestId = client.requestIdCounter++;

    if (token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }

    const closePromise = once(res, 'close').then(() => res);

    proxy.web(req, res);

    time(res => {
      if (res) {
        return `#${requestId} ← ${res.statusCode} ${
          res.statusMessage
        }: ${res.getHeader('x-vercel-id')}`;
      } else {
        return `#${requestId} → ${req.method || 'GET'} ${apiUrl}${req.url}`;
      }
    }, closePromise);
  });

  return server;
}
