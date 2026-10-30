import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import type { ArtifactRecorder, ProxyRequestRecord } from './artifacts';
import type { TestServer } from './test-server';

// Per-test local proxy that adds the `test-id` header and forwards to the
// sandbox. The CLI drops any path on `--api` (src/util/client.ts builds URLs
// with `new URL(path, apiUrl)`) and has no hook for extra headers, so this is
// the only way to attach the test id without changing the CLI. The approach
// was proven in the 2026-10-19 spike (users/schrockn/objectives/
// cli-testserver-tier/updates/2026-10-19-spike-cli-against-testserver.md).

export interface ApiProxy {
  /** `http://127.0.0.1:<port>`; pass as `--api`. */
  url: string;
  requests: ProxyRequestRecord[];
  close: () => Promise<void>;
}

export async function startApiProxy(
  testServer: TestServer,
  artifacts: ArtifactRecorder
): Promise<ApiProxy> {
  const upstream = new URL(testServer.base);
  const transport = upstream.protocol === 'https:' ? https : http;
  const basePath = upstream.pathname.replace(/\/$/, '');
  const requests = artifacts.requests;

  const server = http.createServer((req, res) => {
    const started = Date.now();
    const entry: ProxyRequestRecord = {
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      status: 0,
      ms: 0,
    };
    requests.push(entry);

    const out = transport.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || undefined,
        method: req.method,
        path: `${basePath}${req.url ?? '/'}`,
        headers: {
          ...req.headers,
          host: upstream.host,
          'test-id': testServer.testId,
        },
      },
      up => {
        const status = up.statusCode ?? 502;
        entry.status = status;
        entry.ms = Date.now() - started;
        res.writeHead(status, up.headers);
        // Stream the body through; keep only a prefix of error bodies.
        let errorBody = '';
        up.on('data', (chunk: Buffer) => {
          if (status >= 400 && errorBody.length < 300) {
            errorBody += chunk.toString('utf8');
          }
          res.write(chunk);
        });
        up.on('end', () => {
          if (status >= 400) {
            entry.body = errorBody.slice(0, 300);
          }
          res.end();
        });
        up.on('error', err => {
          entry.body = String(err);
          res.destroy(err);
        });
      }
    );
    out.on('error', err => {
      entry.status = 599;
      entry.ms = Date.now() - started;
      entry.body = String(err);
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end(String(err));
    });
    req.pipe(out);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>(resolve => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
