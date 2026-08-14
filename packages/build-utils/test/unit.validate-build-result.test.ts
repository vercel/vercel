import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileBlob from '../src/file-blob';
import { Lambda } from '../src/lambda';
import { NowBuildError } from '../src/errors';
import { validateBuildResult } from '../src/collect-build-result/validate-build-result';

function createBuildResponse(runtime = 'nodejs22.x') {
  return {
    output: {
      'api/hello': new Lambda({
        files: {
          'index.js': new FileBlob({
            data: 'export default function handler() {}',
          }),
        },
        handler: 'index.js',
        runtime,
      }),
    },
  };
}

describe('validateBuildResult()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when the build result does not include an output property', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: {} as never,
      })
    ).rejects.toMatchObject({
      code: 'NOW_SANDBOX_WORKER_BUILDER_ERROR',
      message: expect.stringContaining('must include an `output` property'),
    });
  });

  it('throws when the build result output is not an object', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: { output: 'nope' } as never,
      })
    ).rejects.toMatchObject({
      code: 'NOW_SANDBOX_WORKER_BUILDER_ERROR',
      message: 'The result of "builder.build" must be an object',
    });
  });

  it('accepts every runtime on the AL2023 allowlist', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.13'),
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });

    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.14'),
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });

    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('executable'),
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });
  });

  it('throws for runtimes that are not on the AL2023 allowlist', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
      })
    ).rejects.toMatchObject({
      code: 'NOW_SANDBOX_WORKER_INVALID_RUNTIME',
      message: expect.stringContaining('api/hello (python3.11)'),
    });
  });

  it('allows invalid runtimes when allowInvalidRuntime is true', async () => {
    await expect(
      validateBuildResult({
        allowInvalidRuntime: true,
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });
  });

  it('prefers top-level functions over vercelConfig.functions', async () => {
    const result = await validateBuildResult({
      buildConfig: {
        functions: {
          '.': { memory: 512 },
        },
        vercelConfig: {
          functions: {
            '.': { memory: 256 },
          },
        },
      },
      buildResponse: createBuildResponse(),
    });

    expect(result.customFunctionConfiguration).toEqual({ memory: 512 });
  });

  it('falls back to vercelConfig.functions when top-level functions are absent', async () => {
    const result = await validateBuildResult({
      buildConfig: {
        vercelConfig: {
          functions: {
            '.': { memory: 256 },
          },
        },
      },
      buildResponse: createBuildResponse(),
    });

    expect(result.customFunctionConfiguration).toEqual({ memory: 256 });
  });

  it('rejects custom runtimes that are not Runtime API v3', async () => {
    let error: unknown;
    try {
      await validateBuildResult({
        buildConfig: {
          functions: {
            '.': { runtime: '@acme/community-runtime' },
          },
        },
        buildResponse: createBuildResponse(),
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(NowBuildError);
    expect(error).toMatchObject({
      code: 'NOW_SANDBOX_WORKER_FUNCTION_RUNTIME_VERSION',
      message: expect.stringContaining('@acme/community-runtime'),
    });
  });

  it('uses the provided Vercel base URL for runtime docs links', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
        vercelBaseUrl: 'https://vercel.example.com',
      })
    ).rejects.toMatchObject({
      code: 'NOW_SANDBOX_WORKER_INVALID_RUNTIME',
      link: 'https://vercel.example.com/docs/functions/runtimes#official-runtimes',
    });
  });
});
