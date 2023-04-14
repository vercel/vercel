import httpProxy from 'http-proxy';
import { createServer, type Server } from 'http';

export function createProxy(apiUrl: string, token?: string): Server {
  const proxy = httpProxy.createProxyServer({
    target: apiUrl,
    changeOrigin: true,
  });

  const server = createServer((req, res) => {
    if (token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }
    proxy.web(req, res);
  });

  return server;
}
