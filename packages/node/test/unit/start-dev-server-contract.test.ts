import { afterEach, describe, expect, test } from 'vitest';
import type { StartDevServerResult } from '@vercel/build-utils';
// Import the built public API because the child dev-server artifact is emitted
// alongside dist/index.js, matching how consumers load this package.
import { startDevServer } from '../../dist/index.js';
import { prepareFilesystem } from './test-utils';

const running: StartDevServerResult[] = [];

afterEach(async () => {
  await Promise.allSettled(
    running.splice(0).map(async server => {
      await server.shutdown?.();
      if (server.pid) {
        try {
          process.kill(server.pid, 0);
        } catch {
          return;
        }
      }
    })
  );
});

describe('startDevServer contract', () => {
  test('skips middleware requests that do not match the configured matcher', async () => {
    const filesystem = await prepareFilesystem({
      'middleware.js': `export default () => new Response('middleware');`,
    });

    const result = await startDevServer({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: {
        middleware: true,
        middlewareMatcher: '/api/:path*',
      },
      meta: { requestUrl: '/dashboard' },
    });

    expect(result).toBeNull();
  });

  test('starts the public Node dev server API and shuts down through IPC', async () => {
    const filesystem = await prepareFilesystem({
      'api/index.cjs': `
        module.exports = (req, res) => {
          res.setHeader('x-dev-contract', 'true');
          res.end(req.method + ':' + req.url);
        };
      `,
    });

    const result = await startDevServer({
      ...filesystem,
      entrypoint: 'api/index.cjs',
      config: {},
      meta: {},
    });
    if (!result) throw new Error('Expected a dev server');
    running.push(result);

    const response = await fetch(`http://127.0.0.1:${result.port}/hello?x=1`, {
      method: 'POST',
      body: 'body',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-dev-contract')).toBe('true');
    expect(await response.text()).toBe('POST:/hello?x=1');
    expect(result.pid).toBeGreaterThan(0);

    await result.shutdown?.();
    running.splice(running.indexOf(result), 1);
  });

  test('uses the nearest package type when starting an ESM JavaScript entrypoint', async () => {
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({ type: 'commonjs' }),
      'apps/api/package.json': JSON.stringify({ type: 'module' }),
      'apps/api/index.js': `
        import { basename } from 'path';
        export default (req, res) => res.end(basename('/esm/nearest'));
      `,
    });

    const result = await startDevServer({
      ...filesystem,
      entrypoint: 'apps/api/index.js',
      config: {},
      meta: {},
    });
    if (!result) throw new Error('Expected a dev server');
    running.push(result);

    const response = await fetch(`http://127.0.0.1:${result.port}/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('nearest');
  });
});
