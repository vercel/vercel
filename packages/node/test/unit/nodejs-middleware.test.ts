import { prepareFilesystem } from './test-utils';
import { build } from '../../src';

describe('Node.js middleware', () => {
  it('should build middleware with nodejs runtime', async () => {
    const filesystem = await prepareFilesystem({
      'middleware.js': `
        export const config = {
          runtime: 'nodejs'
        };
        
        export default (req) => {
          return new Response('nodejs middleware', {
            headers: { 'x-got-middleware': 'true' },
          });
        };
      `,
    });
    
    const buildResult = await build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: {
        middleware: true,
      },
      meta: { skipDownload: true },
    });
    
    expect(buildResult.output).toBeDefined();
    expect(buildResult.routes).toEqual([
      {
        src: '^/.*$',
        middlewareRawSrc: [],
        middlewarePath: 'middleware.js',
        continue: true,
        override: true,
      },
    ]);
  });

  it('should build middleware with edge runtime (default)', async () => {
    const filesystem = await prepareFilesystem({
      'middleware.js': `
        export default (req) => {
          return new Response('edge middleware', {
            headers: { 'x-got-middleware': 'true' },
          });
        };
      `,
    });
    
    const buildResult = await build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: {
        middleware: true,
      },
      meta: { skipDownload: true },
    });
    
    expect(buildResult.output).toBeDefined();
    expect(buildResult.routes).toEqual([
      {
        src: '^/.*$',
        middlewareRawSrc: [],
        middlewarePath: 'middleware.js',
        continue: true,
        override: true,
      },
    ]);
  });

  it('should allow nodejs runtime for non-middleware functions', async () => {
    const filesystem = await prepareFilesystem({
      'api/test.js': `
        export const config = {
          runtime: 'nodejs'
        };
        
        export default (req, res) => {
          res.json({ message: 'test' });
        };
      `,
    });
    
    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/test.js',
      config: {},
      meta: { skipDownload: true },
    });
    
    expect(buildResult.output).toBeDefined();
  });
});
