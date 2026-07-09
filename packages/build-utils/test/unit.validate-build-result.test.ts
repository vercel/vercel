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

  it('matches the AL2023 allowlist used by existing callers', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.13'),
        osRelease: { VERSION: '2023' },
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });

    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.14'),
        osRelease: { VERSION: '2023' },
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });

    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('executable'),
        osRelease: { VERSION: '2023' },
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });
  });

  it('throws for invalid runtimes on AL2023', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
        osRelease: { VERSION: '2023' },
      })
    ).rejects.toMatchObject({
      code: 'NOW_SANDBOX_WORKER_INVALID_RUNTIME',
      message: expect.stringContaining('api/hello (python3.11)'),
    });
  });

  it('skips AL2023 runtime validation outside AL2023', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
        osRelease: { VERSION: '2' },
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });
  });

  it('allows invalid runtimes when allowInvalidRuntime is true', async () => {
    await expect(
      validateBuildResult({
        allowInvalidRuntime: true,
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
        osRelease: { VERSION: '2023' },
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
      osRelease: { VERSION: '2023' },
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
      osRelease: { VERSION: '2023' },
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
        osRelease: { VERSION: '2023' },
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
        osRelease: { VERSION: '2023' },
        vercelBaseUrl: 'https://vercel.example.com',
      })
    ).rejects.toMatchObject({
      code: 'NOW_SANDBOX_WORKER_INVALID_RUNTIME',
      link: 'https://vercel.example.com/docs/functions/runtimes#official-runtimes',
    });
  });

  it('skips AL2023 runtime validation when osRelease is not provided', async () => {
    await expect(
      validateBuildResult({
        buildConfig: {},
        buildResponse: createBuildResponse('python3.11'),
      })
    ).resolves.toMatchObject({
      buildOutputMap: expect.any(Object),
      customFunctionConfiguration: undefined,
    });
  });
});
