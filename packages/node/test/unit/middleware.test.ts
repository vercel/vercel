import { it, expect } from 'vitest';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';

it.each([
  {
    name: 'use "nodejs" as default runtime',
    expectedType: 'Lambda',
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
