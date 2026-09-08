import { afterEach, describe, expect, test } from 'vitest';
import { join } from 'path';
import type { NodejsLambda } from '@vercel/build-utils';
import { build } from '../../src';
import { fixConfig } from '../../src/typescript';
import { normalizeFiles, prepareFilesystem } from './test-utils';

const originalTypescriptErrors =
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS;

afterEach(() => {
  if (originalTypescriptErrors === undefined) {
    delete process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS;
  } else {
    process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = originalTypescriptErrors;
  }
});

describe('fixConfig() compatibility contract', () => {
  test.each([
    { nodeVersion: 12, target: 'ES2019' },
    { nodeVersion: 14, target: 'ES2020' },
    { nodeVersion: 16, target: 'ES2021' },
    { nodeVersion: 24, target: 'ES2021' },
  ])('defaults Node $nodeVersion to $target', ({ nodeVersion, target }) => {
    const config = { compilerOptions: {} };
    fixConfig(config, nodeVersion);

    expect(config.compilerOptions).toMatchObject({
      target,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: false,
      esModuleInterop: true,
    });
  });

  test('preserves explicit compilation semantics', () => {
    const config = {
      compilerOptions: {
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'Node',
        strict: true,
        esModuleInterop: false,
      },
    };

    fixConfig(config, 24);

    expect(config.compilerOptions).toMatchObject({
      target: 'ES2022',
      module: 'CommonJS',
      moduleResolution: 'Node',
      strict: true,
      esModuleInterop: false,
    });
  });

  test('removes emit and incremental options controlled by the builder', () => {
    const config = {
      compilerOptions: {
        out: 'bundle.js',
        outFile: 'bundle.js',
        composite: true,
        declarationDir: 'types',
        declarationMap: true,
        emitDeclarationOnly: true,
        tsBuildInfoFile: '.cache/build.tsbuildinfo',
        incremental: true,
      },
    };

    fixConfig(config, 24);

    expect(config.compilerOptions).not.toHaveProperty('out');
    expect(config.compilerOptions).not.toHaveProperty('outFile');
    expect(config.compilerOptions).not.toHaveProperty('composite');
    expect(config.compilerOptions).not.toHaveProperty('declarationDir');
    expect(config.compilerOptions).not.toHaveProperty('declarationMap');
    expect(config.compilerOptions).not.toHaveProperty('emitDeclarationOnly');
    expect(config.compilerOptions).not.toHaveProperty('tsBuildInfoFile');
    expect(config.compilerOptions).not.toHaveProperty('incremental');
  });
});

describe('TypeScript build compatibility contract', () => {
  test.each([
    { extension: 'ts', outputExtension: 'js' },
    { extension: 'tsx', outputExtension: 'js' },
    { extension: 'mts', outputExtension: 'mjs' },
    { extension: 'cts', outputExtension: 'cjs' },
  ])('emits .$extension entrypoints and dependencies as .$outputExtension with source maps', async ({
    extension,
    outputExtension,
  }) => {
    const entrypoint = `api/index.${extension}`;
    const dependency = `api/value.${extension}`;
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({ type: 'module' }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          jsx: 'react-jsx',
          allowImportingTsExtensions: true,
        },
      }),
      [dependency]: `export const value: string = 'ok';`,
      [entrypoint]: `
          import { value } from './value.${extension}';
          export default (_req: unknown, res: { end(value: string): void }) => res.end(value);
        `,
    });

    const result = await build({
      ...filesystem,
      entrypoint,
      config: {},
      meta: { skipDownload: true },
    });
    const lambda = result.output as NodejsLambda;
    const files = normalizeFiles(lambda.files);
    const outputEntrypoint = `api/index.${outputExtension}`;
    const outputDependency = `api/value.${outputExtension}`;

    expect(lambda.handler).toBe(join('api', `index.${outputExtension}`));
    expect(files[outputEntrypoint]).toBeDefined();
    expect(files[`${outputEntrypoint}.map`]).toBeDefined();
    expect(files[outputDependency]).toBeDefined();
    expect(files[`${outputDependency}.map`]).toBeDefined();
    expect(lambda.shouldAddSourcemapSupport).toBe(true);
  });

  test('continues emitting when type errors are not explicitly enforced', async () => {
    delete process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS;
    const filesystem = await prepareFilesystem({
      'api/index.ts': `
        const value: string = 123;
        export default (_req: unknown, res: { end(value: string): void }) => res.end(value);
      `,
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'api/index.ts',
      config: {},
      meta: { skipDownload: true },
    });

    expect(
      normalizeFiles((result.output as NodejsLambda).files)['api/index.js']
    ).toBeDefined();
  });

  test('rejects type errors when experimental TypeScript errors are enabled', async () => {
    process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
    const filesystem = await prepareFilesystem({
      'api/index.ts': `
        const value: string = 123;
        export default (_req: unknown, res: { end(value: string): void }) => res.end(value);
      `,
    });

    await expect(
      build({
        ...filesystem,
        entrypoint: 'api/index.ts',
        config: {},
        meta: { skipDownload: true },
      })
    ).rejects.toMatchObject({ code: 'NODE_TYPESCRIPT_ERROR' });
  });

  test('reports malformed tsconfig files as TypeScript build errors', async () => {
    const filesystem = await prepareFilesystem({
      'tsconfig.json': '{ invalid json',
      'api/index.ts': `export default (_req: unknown, res: { end(value: string): void }) => res.end('ok');`,
    });

    await expect(
      build({
        ...filesystem,
        entrypoint: 'api/index.ts',
        config: {},
        meta: { skipDownload: true },
      })
    ).rejects.toMatchObject({ code: 'NODE_TYPESCRIPT_ERROR' });
  });

  test('resolves tsconfig paths across a workspace-style project', async () => {
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({
        private: true,
        workspaces: ['apps/*', 'packages/*'],
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          baseUrl: '.',
          paths: { '@workspace/shared': ['packages/shared/src/index.ts'] },
        },
      }),
      'apps/api/index.ts': `
        import { value } from '@workspace/shared';
        export default (_req: unknown, res: { end(value: string): void }) => res.end(value);
      `,
      'packages/shared/src/index.ts': `export const value: string = 'workspace';`,
    });

    const result = await build({
      ...filesystem,
      entrypoint: 'apps/api/index.ts',
      config: {},
      meta: { skipDownload: true },
    });
    const files = normalizeFiles((result.output as NodejsLambda).files);

    expect(files['apps/api/index.js']).toBeDefined();
    // Characterize the current behavior: TypeScript resolves the alias for
    // diagnostics, but NFT does not trace tsconfig path aliases into the Lambda.
    expect(files['packages/shared/src/index.js']).toBeUndefined();
  });
});
