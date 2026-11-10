import { afterEach, describe, expect, test } from 'vitest';
import type { NodejsLambda } from '@vercel/build-utils';
import { build } from '../../src';
import { normalizeFiles, prepareFilesystem } from './test-utils';

const envKeys = [
  'NODEJS_HELPERS',
  'VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION',
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]])
) as Record<(typeof envKeys)[number], string | undefined>;

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function buildLambda(
  source: string,
  options: {
    config?: Parameters<typeof build>[0]['config'];
    useWebApi?: boolean;
  } = {}
) {
  const filesystem = await prepareFilesystem({ 'api/index.js': source });
  const result = await build({
    ...filesystem,
    entrypoint: 'api/index.js',
    config: options.config ?? {},
    useWebApi: options.useWebApi,
    meta: { skipDownload: true },
  });
  expect(result.output.type).toBe('Lambda');
  return result.output as NodejsLambda;
}

describe('NodejsLambda build contract', () => {
  test('passes static function metadata to the Lambda', async () => {
    const lambda = await buildLambda(`
      export const config = {
        architecture: 'arm64',
        maxDuration: 37,
        supportsResponseStreaming: true,
        useWebApi: true,
      };
      export default (req, res) => res.end('ok');
    `);

    expect({
      architecture: lambda.architecture,
      maxDuration: lambda.maxDuration,
      supportsResponseStreaming: lambda.supportsResponseStreaming,
      useWebApi: lambda.useWebApi,
    }).toEqual({
      architecture: 'arm64',
      maxDuration: 37,
      supportsResponseStreaming: true,
      useWebApi: true,
    });
  });

  test('supports the legacy experimentalResponseStreaming option', async () => {
    const lambda = await buildLambda(`
      export const config = { experimentalResponseStreaming: true };
      export default (req, res) => res.end('ok');
    `);

    expect(lambda.supportsResponseStreaming).toBe(true);
  });

  test('an explicit build option takes precedence over static useWebApi', async () => {
    const lambda = await buildLambda(
      `
        export const config = { useWebApi: true };
        export default (req, res) => res.end('ok');
      `,
      { useWebApi: false }
    );

    expect(lambda.useWebApi).toBe(false);
  });

  test('config.helpers disables request helpers', async () => {
    const lambda = await buildLambda(
      `export default (req, res) => res.end('ok');`,
      { config: { helpers: false } }
    );

    expect(lambda.shouldAddHelpers).toBe(false);
  });

  test('NODEJS_HELPERS=0 disables request helpers', async () => {
    process.env.NODEJS_HELPERS = '0';
    const lambda = await buildLambda(
      `export default (req, res) => res.end('ok');`
    );

    expect(lambda.shouldAddHelpers).toBe(false);
  });

  test('enables request helpers by default', async () => {
    delete process.env.NODEJS_HELPERS;
    const lambda = await buildLambda(
      `export default (req, res) => res.end('ok');`
    );

    expect(lambda.shouldAddHelpers).toBe(true);
  });

  test('passes the automatic fetch instrumentation opt-out', async () => {
    process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION = '1';
    const lambda = await buildLambda(
      `export default (req, res) => res.end('ok');`
    );

    expect(lambda.shouldDisableAutomaticFetchInstrumentation).toBe(true);
  });
});

describe('file tracing contract', () => {
  test('includeFiles adds unreferenced files to the Lambda', async () => {
    const filesystem = await prepareFilesystem({
      'api/index.js': `export default (req, res) => res.end('ok');`,
      'api/templates/message.txt': 'included',
      'api/templates/ignored.txt': 'also included',
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.js',
      config: { includeFiles: 'api/templates/**' },
      meta: { skipDownload: true },
    });
    const lambda = result.output as NodejsLambda;
    const files = normalizeFiles(lambda.files);

    expect(Object.keys(files).sort()).toEqual(
      expect.arrayContaining([
        'api/index.js',
        'api/templates/ignored.txt',
        'api/templates/message.txt',
      ])
    );
  });

  test('excludeFiles removes a statically traced dependency', async () => {
    const filesystem = await prepareFilesystem({
      'api/index.js': `
        const excluded = require('./excluded.json');
        const kept = require('./kept.json');
        export default (req, res) => res.end(kept.value + excluded.value);
      `,
      'api/excluded.json': JSON.stringify({ value: 'excluded' }),
      'api/kept.json': JSON.stringify({ value: 'kept' }),
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.js',
      config: { excludeFiles: 'api/excluded.json' },
      meta: { skipDownload: true },
    });
    const files = normalizeFiles((result.output as NodejsLambda).files);

    expect(files['api/kept.json']).toBeDefined();
    expect(files['api/excluded.json']).toBeUndefined();
  });

  test('an explicitly included file remains excluded when it also matches excludeFiles', async () => {
    const filesystem = await prepareFilesystem({
      'api/index.js': `export default (req, res) => res.end('ok');`,
      'api/data.txt': 'characterize precedence',
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.js',
      config: {
        includeFiles: 'api/data.txt',
        excludeFiles: 'api/data.txt',
      },
      meta: { skipDownload: true },
    });
    const files = normalizeFiles((result.output as NodejsLambda).files);

    // includeFiles are added before tracing and are not removed by NFT's ignore list.
    expect(files['api/data.txt']).toBeDefined();
  });
});
