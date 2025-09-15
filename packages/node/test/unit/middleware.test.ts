import { it, expect } from 'vitest';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';
import { NodejsLambda } from '@vercel/build-utils/dist/nodejs-lambda';

it.each([
  {
    name: 'use "edge" as default runtime',
    expectedType: 'EdgeFunction',
  },
  {
    name: 'use "nodejs" as runtime',
    runtime: 'nodejs',
    expectedType: 'Lambda',
  },
  {
    name: 'use "edge" as runtime',
    runtime: 'edge',
    expectedType: 'EdgeFunction',
  },
  {
    name: 'use "experimental-edge" as runtime',
    runtime: 'experimental-edge',
    expectedType: 'EdgeFunction',
  },
])('$name', async ({ runtime, expectedType }) => {
  const config = runtime
    ? `export const config = { runtime: '${runtime}' }`
    : '';
  const filesystem = await prepareFilesystem({
    'middleware.js': `
      ${config};
      export default (req) => {
        return new Response('${runtime} middleware', {
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
  expect(buildResult.output.type).toBe(expectedType);
  if (expectedType === 'Lambda')
    expect((buildResult.output as NodejsLambda).useWebApi).toBe(true);
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

it('should throw an error for an unsupported runtime', async () => {
  const filesystem = await prepareFilesystem({
    'middleware.js': `
      export const config = {
        runtime: 'invalid'
      };

      export default (req) => {
        return new Response('edge middleware', {
          headers: { 'x-got-middleware': 'true' },
        });
      };
    `,
  });

  await expect(
    build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: {
        middleware: true,
      },
      meta: { skipDownload: true },
    })
  ).rejects.toThrow(
    'middleware.js: unsupported "runtime" value in `config`: "invalid" (must be one of: ["edge","experimental-edge","nodejs"])'
  );
});

it('nodejs middleware uses Web API interface', async () => {
  const filesystem = await prepareFilesystem({
    'middleware.js': `
      export const config = {
        runtime: 'nodejs'
      };

      export default function middleware(request) {
        // Middleware should receive Web API Request object, not Node.js req
        const url = new URL(request.url);
        const headers = new Headers();
        headers.set('x-middleware-runtime', 'nodejs');
        headers.set('x-request-type', request.constructor.name);

        return new Response('nodejs middleware with web api', {
          headers,
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
  expect(buildResult.output.type).toBe('Lambda');
  expect((buildResult.output as NodejsLambda).useWebApi).toBe(true);
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

it('nodejs middleware works fine with streaming mode', async () => {
  const filesystem = await prepareFilesystem({
    'middleware.js': `
      export const config = {
        runtime: 'nodejs'
      };

      export default function middleware(request) {
        // This middleware should be eligible for streaming mode
        // since it uses web handlers interface
        return new Response('streaming middleware', {
          headers: { 'x-middleware-streaming': 'true' },
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
  expect(buildResult.output.type).toBe('Lambda');

  // The key point is that middleware with nodejs runtime should be built successfully
  // and will be configured to use web handlers interface with streaming capability
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
