import { afterEach, it, expect, vi } from 'vitest';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';
import {
  MIDDLEWARE_NODEJS_DEFAULT_ENV,
  MIDDLEWARE_NODEJS_DEFAULT_SINCE,
} from '../../src/utils';
import { NodejsLambda } from '@vercel/build-utils/dist/nodejs-lambda';

const NEW_PROJECT = MIDDLEWARE_NODEJS_DEFAULT_SINCE.getTime();
const EXISTING_PROJECT = NEW_PROJECT - 1;

afterEach(() => {
  vi.unstubAllEnvs();
});

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
  {
    name: 'use "nodejs" for an explicit proxy',
    middlewareRuntime: 'nodejs' as const,
    expectedType: 'Lambda',
  },
  {
    name: 'use "nodejs" as runtime for an explicit proxy',
    runtime: 'nodejs',
    middlewareRuntime: 'nodejs' as const,
    expectedType: 'Lambda',
  },
  {
    name: 'use "nodejs" as default runtime for a new project',
    projectCreatedAt: NEW_PROJECT,
    nodejsDefault: true,
    expectedType: 'Lambda',
  },
  {
    name: 'keep "edge" as default runtime for an existing project',
    projectCreatedAt: EXISTING_PROJECT,
    nodejsDefault: true,
    expectedType: 'EdgeFunction',
  },
  {
    name: 'keep "edge" as default runtime for a new project without the flag',
    projectCreatedAt: NEW_PROJECT,
    expectedType: 'EdgeFunction',
  },
  {
    name: 'allow opting back into "edge" once the default flipped',
    runtime: 'edge',
    projectCreatedAt: NEW_PROJECT,
    nodejsDefault: true,
    expectedType: 'EdgeFunction',
  },
])('$name', async ({
  runtime,
  middlewareRuntime,
  projectCreatedAt,
  nodejsDefault,
  expectedType,
}) => {
  if (nodejsDefault) {
    vi.stubEnv(MIDDLEWARE_NODEJS_DEFAULT_ENV, '1');
  }

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
      middlewareRuntime,
      projectSettings: { createdAt: projectCreatedAt },
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

it.each([
  'edge',
  'experimental-edge',
])('rejects the "%s" runtime for an explicit proxy', async runtime => {
  const filesystem = await prepareFilesystem({
    'proxy.js': `
        export const config = { runtime: '${runtime}' };
        export default () => new Response('proxy');
      `,
  });

  await expect(
    build({
      ...filesystem,
      entrypoint: 'proxy.js',
      config: {
        middleware: true,
        middlewareRuntime: 'nodejs',
      },
      meta: { skipDownload: true },
    })
  ).rejects.toThrow(
    `proxy.js: explicit proxy entrypoints only support the Node.js runtime. Remove \`runtime: "${runtime}"\` from the exported \`config\`.`
  );
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

it.each([
  { runtime: undefined, warns: true },
  { runtime: 'edge', warns: true },
  { runtime: 'nodejs', warns: false },
])('runtime="$runtime" warns about the edge deprecation: $warns', async ({
  runtime,
  warns,
}) => {
  const consoleWarnSpy = vi.spyOn(console, 'warn');
  const config = runtime
    ? `export const config = { runtime: '${runtime}' };`
    : '';
  const filesystem = await prepareFilesystem({
    'middleware.js': `
        ${config}
        export default () => new Response('middleware');
      `,
  });

  await build({
    ...filesystem,
    entrypoint: 'middleware.js',
    config: { middleware: true },
    meta: { skipDownload: true },
  });

  const warned = consoleWarnSpy.mock.calls.some(([message]) =>
    String(message).includes('uses the deprecated "edge" runtime')
  );
  expect(warned).toBe(warns);
  consoleWarnSpy.mockRestore();
});
