import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prepareFlagsDefinitions } = vi.hoisted(() => ({
  prepareFlagsDefinitions: vi.fn(),
}));

vi.mock('@vercel/build-utils', () => ({
  NowBuildError: class NowBuildError extends Error {
    code: string;
    link: string;
    constructor(opts: { code: string; message: string; link: string }) {
      super(opts.message);
      this.code = opts.code;
      this.link = opts.link;
    }
  },
}));

vi.mock('@vercel/prepare-flags-definitions', () => ({
  prepareFlagsDefinitions,
}));

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));

vi.mock('../../../../src/util/pkg', () => ({
  default: { version: '1.0.0-test' },
}));

import { emitFlagsDatafiles } from '../../../../src/commands/build/emit-flags-datafiles';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('emitFlagsDatafiles', () => {
  it('should call prepareFlagsDefinitions with cwd and env', async () => {
    prepareFlagsDefinitions.mockResolvedValueOnce(undefined);

    await emitFlagsDatafiles('/app', { SOME_VAR: 'hello' });

    expect(prepareFlagsDefinitions).toHaveBeenCalledTimes(1);
    expect(prepareFlagsDefinitions).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/app',
        env: { SOME_VAR: 'hello' },
      })
    );
  });

  it('should pass version from package.json', async () => {
    prepareFlagsDefinitions.mockResolvedValueOnce(undefined);

    await emitFlagsDatafiles('/app', {});

    const opts = prepareFlagsDefinitions.mock.calls[0][0];
    expect(opts.version).toBe('1.0.0-test');
  });

  it('should pass a fetch function', async () => {
    prepareFlagsDefinitions.mockResolvedValueOnce(undefined);

    await emitFlagsDatafiles('/app', {});

    const opts = prepareFlagsDefinitions.mock.calls[0][0];
    expect(typeof opts.fetch).toBe('function');
  });

  it('should pass an output adapter with debug and time', async () => {
    prepareFlagsDefinitions.mockResolvedValueOnce(undefined);

    await emitFlagsDatafiles('/app', {});

    const opts = prepareFlagsDefinitions.mock.calls[0][0];
    expect(typeof opts.output.debug).toBe('function');
    expect(typeof opts.output.time).toBe('function');
  });

  it('should wrap errors from the package in NowBuildError', async () => {
    prepareFlagsDefinitions.mockRejectedValueOnce(
      new Error(
        'Failed to fetch flag definitions for vf_test_abc123de******: 500 Internal Server Error'
      )
    );

    await expect(
      emitFlagsDatafiles('/app', { KEY: 'vf_test' })
    ).rejects.toMatchObject({
      code: 'VERCEL_FLAGS_DEFINITIONS_FETCH_FAILED',
      message: expect.stringContaining('Failed to fetch flag definitions'),
      link: 'https://vercel.com/docs/flags',
    });
  });

  it('should wrap non-Error exceptions in NowBuildError', async () => {
    prepareFlagsDefinitions.mockRejectedValueOnce('string error');

    await expect(
      emitFlagsDatafiles('/app', { KEY: 'vf_test' })
    ).rejects.toMatchObject({
      code: 'VERCEL_FLAGS_DEFINITIONS_FETCH_FAILED',
      message: 'string error',
    });
  });

  it('should succeed when prepareFlagsDefinitions resolves', async () => {
    prepareFlagsDefinitions.mockResolvedValueOnce(undefined);

    await expect(
      emitFlagsDatafiles('/app', { SDK_KEY: 'vf_abc123' })
    ).resolves.toBeUndefined();
  });
});
