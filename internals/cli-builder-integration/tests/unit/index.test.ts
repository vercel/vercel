import type { BuildOptions, BuilderVX } from '@vercel/build-utils';
import { Span } from '@vercel/build-utils';
import { expect, test } from 'vitest';
import { executeBuilder } from '@vercel-internals/cli-builder-integration';

test('unwraps version-independent Builder results', async () => {
  const result = { output: {} };
  const builder: BuilderVX = {
    version: -1,
    build: async () => ({ resultVersion: 2, result }),
  };
  const buildOptions: BuildOptions = {
    files: {},
    entrypoint: 'index.js',
    workPath: '/work',
    repoRootPath: '/work',
    config: {},
  };

  await expect(
    executeBuilder({
      builder,
      buildOptions,
      span: new Span({ name: 'test' }),
      isFrontendBuilder: false,
      hasDetectedServices: false,
    })
  ).resolves.toEqual({
    buildResult: result,
    rawBuildResult: { resultVersion: 2, result },
  });
});
