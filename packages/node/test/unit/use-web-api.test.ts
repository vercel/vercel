import { describe, it, expect } from 'vitest';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';
import type { NodejsLambda } from '@vercel/build-utils';

describe('useWebApi static config', () => {
  it('should enable useWebApi when set to true in static config', async () => {
    const filesystem = await prepareFilesystem({
      'api/web.js': `
        export const config = {
          useWebApi: true,
        };
        export default (request) => new Response('web api');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/web.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect((buildResult.output as NodejsLambda).useWebApi).toBe(true);
  });

  it('should not enable useWebApi when set to false in static config', async () => {
    const filesystem = await prepareFilesystem({
      'api/web.js': `
        export const config = {
          useWebApi: false,
        };
        export default (req, res) => res.send('node');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/web.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect((buildResult.output as NodejsLambda).useWebApi).toBe(false);
  });

  it('should leave useWebApi undefined when not set in static config', async () => {
    const filesystem = await prepareFilesystem({
      'api/node.js': `
        export default (req, res) => res.send('node');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/node.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect((buildResult.output as NodejsLambda).useWebApi).toBeUndefined();
  });

  it('should prefer explicit useWebApi build option over static config', async () => {
    const filesystem = await prepareFilesystem({
      'api/web.js': `
        export const config = {
          useWebApi: false,
        };
        export default (request) => new Response('web api');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/web.js',
      shim: undefined,
      useWebApi: true,
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect((buildResult.output as NodejsLambda).useWebApi).toBe(true);
  });
});
