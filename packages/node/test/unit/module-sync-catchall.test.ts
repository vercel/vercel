import { describe, expect, test } from 'vitest';
import { build } from '../../src';
import type { NodejsLambda } from '@vercel/build-utils';
import { prepareFixtureFilesystem } from './test-utils';

const normalizePath = (filePath: string) => filePath.replace(/\\/g, '/');

describe('moduleSyncCatchall tracing', () => {
  test('includes both module-sync and fallback export targets from wildcard patterns', async () => {
    const filesystem = await prepareFixtureFilesystem('module-sync-catchall');

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'index.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output.type).toBe('Lambda');

    const lambda = buildResult.output as NodejsLambda;
    const fileKeys = Object.keys(lambda.files).map(normalizePath);

    expect(fileKeys).toContain('index.js');
    expect(fileKeys).toContain(
      'node_modules/test-pkg-sync-catchall/package.json'
    );
    expect(fileKeys).toContain(
      'node_modules/test-pkg-sync-catchall/sync/feature.js'
    );
    expect(fileKeys).toContain(
      'node_modules/test-pkg-sync-catchall/fallback/feature.js'
    );
  });
});
