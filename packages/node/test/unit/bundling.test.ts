import { afterEach, describe, it, expect } from 'vitest';
import { join } from 'path';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';
import type { NodejsLambda } from '@vercel/build-utils';

describe('experimentalAllowBundling', () => {
  const originalEnv = process.env.VERCEL_API_FUNCTION_BUNDLING;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VERCEL_API_FUNCTION_BUNDLING;
    } else {
      process.env.VERCEL_API_FUNCTION_BUNDLING = originalEnv;
    }
  });

  it('should set experimentalAllowBundling when env var is enabled and zeroConfig is true', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect((buildResult.output as NodejsLambda).experimentalAllowBundling).toBe(
      true
    );
  });

  it('should not set experimentalAllowBundling when env var is absent', async () => {
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect(
      (buildResult.output as NodejsLambda).experimentalAllowBundling
    ).toBeUndefined();
  });

  it('should not set experimentalAllowBundling when zeroConfig is false', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect(
      (buildResult.output as NodejsLambda).experimentalAllowBundling
    ).toBeUndefined();
  });

  it('should not set experimentalAllowBundling for edge functions', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/edge.js': `
        export const config = { runtime: 'edge' };
        export default (req) => new Response('edge');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/edge.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('EdgeFunction');
  });

  it('should not set experimentalAllowBundling for middleware', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'middleware.js': `
        export default (req) => new Response('middleware');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: { zeroConfig: true, middleware: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    // Middleware becomes an EdgeFunction, not a Lambda
    expect(buildResult.output.type).toBe('EdgeFunction');
  });

  it('should use files property (not zipBuffer) for bundling-enabled lambdas', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.files).toBeDefined();
    expect(Object.keys(lambda.files).length).toBeGreaterThan(0);
    expect((lambda as any).zipBuffer).toBeUndefined();
  });

  it('should set handler to shared bundled handler when bundling is enabled', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    // All bundleable lambdas must share the same handler so groupLambdas
    // can match their signatures and group them into a single Lambda.
    expect(lambda.handler).toBe('___vc_bundled_api_handler.js');
    expect(lambda.files['___vc_bundled_api_handler.js']).toBeDefined();
    // The original user entrypoint should still be in files
    expect(lambda.files[join('api', 'hello.js')]).toBeDefined();
  });

  it('should emit handle:hit routes with x-matched-path request header transforms when bundling is enabled', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.routes).toEqual([
      { handle: 'hit' },
      {
        src: '/index(?:/)?',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-matched-path' },
            args: '/',
          },
        ],
        continue: true,
        important: true,
      },
      {
        src: '/((?!index$).*?)(?:/)?',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-matched-path' },
            args: '/$1',
          },
        ],
        continue: true,
        important: true,
      },
    ]);
  });

  it('should not emit routes when bundling is disabled', async () => {
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.routes).toBeUndefined();
  });

  it('should use original handler when bundling is disabled', async () => {
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.handler).toBe(join('api', 'hello.js'));
  });
});
