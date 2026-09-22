import { afterEach, describe, expect, test } from 'vitest';
import type { EdgeFunction } from '@vercel/build-utils';
import { build } from '../../../src';
import { normalizeFiles, prepareFilesystem } from '../test-utils';

const originalNoBabel = process.env.VERCEL_EDGE_NO_BABEL;

afterEach(() => {
  if (originalNoBabel === undefined) delete process.env.VERCEL_EDGE_NO_BABEL;
  else process.env.VERCEL_EDGE_NO_BABEL = originalNoBabel;
});

describe('Edge build contract', () => {
  test('prefers a dependency browser entry while preserving its package.json', async () => {
    const packageJson = JSON.stringify({
      name: 'edge-package',
      version: '1.0.0',
      main: './node.cjs',
      module: './module.js',
      browser: './browser.js',
    });
    const filesystem = await prepareFilesystem({
      'api/index.js': `
        import value from 'edge-package';
        export const config = { runtime: 'edge' };
        export default () => new Response(value);
      `,
      'node_modules/edge-package/package.json': packageJson,
      'node_modules/edge-package/node.cjs': `module.exports = 'node';`,
      'node_modules/edge-package/module.js': `export default 'module';`,
      'node_modules/edge-package/browser.js': `export default 'browser';`,
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.js',
      config: {},
      meta: { skipDownload: true },
    });
    const files = normalizeFiles((result.output as EdgeFunction).files);

    expect(files['node_modules/edge-package/browser.js']).toBeDefined();
    expect(files['node_modules/edge-package/module.js']).toBeUndefined();
    expect(files['node_modules/edge-package/node.cjs']).toBeUndefined();

    const packageFile = files['node_modules/edge-package/package.json'];
    expect(packageFile).toBeDefined();
    const chunks: Buffer[] = [];
    const stream = packageFile.toStream();
    await new Promise<void>((resolve, reject) => {
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    expect(Buffer.concat(chunks).toString()).toBe(packageJson);
  });

  test('traces the real WASM asset for a .wasm?module import', async () => {
    const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const filesystem = await prepareFilesystem({
      'api/index.js': `
        import wasm from './increment.wasm?module';
        export const config = { runtime: 'edge' };
        export default () => new Response(String(wasm));
      `,
      'api/increment.wasm': wasm,
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.js',
      config: {},
      meta: { skipDownload: true },
    });
    const files = normalizeFiles((result.output as EdgeFunction).files);

    expect(files['api/increment.wasm']).toBeDefined();
    expect(files['api/increment.wasm?module']).toBeUndefined();
  });

  test('VERCEL_EDGE_NO_BABEL preserves ESM source without a generated map', async () => {
    process.env.VERCEL_EDGE_NO_BABEL = '1';
    const filesystem = await prepareFilesystem({
      'api/index.js': `
        export const config = { runtime: 'edge' };
        export default () => new Response('edge');
      `,
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.js',
      config: {},
      meta: { skipDownload: true },
    });
    const files = normalizeFiles((result.output as EdgeFunction).files);

    expect(files['api/index.js']).toBeDefined();
    expect(files['api/index.js.map']).toBeUndefined();
  });
});
