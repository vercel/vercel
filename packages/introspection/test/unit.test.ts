import { join } from 'path';
import { vi, describe, expect, it } from 'vitest';
import { readdir } from 'fs/promises';
import { introspectApp } from '../dist/index.mjs';
import execa from 'execa';
import { createServer } from 'http';

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    fixtureName => fixtureName.includes('')
  );
  for (const fixtureName of fixtures) {
    it(`builds ${fixtureName}`, async () => {
      const dir = join(__dirname, 'fixtures', fixtureName);
      await execa('npm', ['install'], {
        cwd: dir,
      });
      const files = await readdir(dir);
      const handler = files.find(file => file.includes('index'));
      if (!handler) {
        throw new Error(`Handler not found in ${dir}`);
      }

      const mockFn = vi.fn();
      const mockServer = await startMockServer(mockFn);

      process.env.MOCK_SERVER_URL = mockServer.url;

      const result = await introspectApp({
        dir,
        handler,
        framework: undefined,
        env: {},
      });
      expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
        `${dir}/routes.json`
      );
      delete process.env.MOCK_SERVER_URL;
      await mockServer.close();
    });
  }
});

function startMockServer(
  onRequest?: (req: { method: string; url: string }) => void
) {
  const server = createServer((req, res) => {
    console.log(`[Mock Server] ${req.method} ${req.url}`);

    if (onRequest) {
      onRequest({ method: req.method || 'GET', url: req.url || '/' });
    }

    // Return a simple JSON response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        message: 'Mock server response',
        url: req.url,
        method: req.method,
      })
    );
  });

  return new Promise<{ url: string; close: () => Promise<void> }>(resolve => {
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = `http://localhost:${port}`;

      resolve({
        url,
        close: () => {
          return new Promise(resolveClose => {
            server.close(() => {
              resolveClose();
            });
          });
        },
      });
    });
  });
}
