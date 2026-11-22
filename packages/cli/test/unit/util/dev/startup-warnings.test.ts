import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileFsRef, type GetDevWarnings } from '@vercel/build-utils';
import DevServer from '../../../../src/util/dev/server';
import { getBuildMatches } from '../../../../src/util/dev/builder';
import type { BuildMatch } from '../../../../src/util/dev/types';
import output from '../../../../src/output-manager';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../../../src/util/dev/builder', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../../src/util/dev/builder')
  >()),
  getBuildMatches: vi.fn(),
}));

describe('DevServer startup warnings', () => {
  const warning = 'middleware.js uses the deprecated "edge" runtime.';
  const getDevWarnings = vi.fn<GetDevWarnings>();
  const startDevServer = vi.fn();
  const build = vi.fn();
  let server: DevServer;
  let match: BuildMatch;

  beforeEach(() => {
    vi.clearAllMocks();
    getDevWarnings.mockReset().mockResolvedValue([warning]);
    server = new DevServer(process.cwd(), {
      projectSettings: { createdAt: 123 },
    } as any);
    server.files = {
      'middleware.js': new FileFsRef({
        fsPath: `${server.cwd}/middleware.js`,
      }),
    };
    server.envConfigs = {
      runEnv: { RUNTIME_ENV: 'runtime' },
      buildEnv: { BUILD_ENV: 'build' },
      allEnv: {},
    };
    match = {
      src: 'middleware.js',
      entrypoint: 'middleware.js',
      use: '@vercel/node',
      config: { middleware: true },
      builderWithPkg: {
        builder: {
          version: 3,
          build,
          shouldServe: () => true,
          startDevServer,
          getDevWarnings,
        },
        pkg: { name: '@vercel/node' },
        path: '',
        pkgPath: '',
        dynamicallyInstalled: false,
      },
      buildOutput: {},
      buildResults: new Map(),
      buildTimestamp: 0,
    };
    vi.mocked(getBuildMatches).mockResolvedValue([match]);
  });

  it('prints warnings during initial discovery without starting middleware', async () => {
    await server.updateBuildMatches({}, true);

    expect(output.warn).toHaveBeenCalledExactlyOnceWith(warning);
    expect(getDevWarnings).toHaveBeenCalledWith(
      expect.objectContaining({
        files: server.files,
        entrypoint: 'middleware.js',
        workPath: server.cwd,
        config: { middleware: true, projectSettings: { createdAt: 123 } },
        meta: {
          isDev: true,
          env: expect.objectContaining({ RUNTIME_ENV: 'runtime' }),
          buildEnv: { BUILD_ENV: 'build' },
        },
      })
    );
    expect(startDevServer).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();

    await server.updateBuildMatches({});
    expect(output.warn).toHaveBeenCalledOnce();
    expect(getDevWarnings).toHaveBeenCalledOnce();
  });

  it('supports builders without a startup-warning hook', async () => {
    delete match.builderWithPkg.builder.getDevWarnings;

    await server.updateBuildMatches({}, true);

    expect(output.warn).not.toHaveBeenCalled();
    expect(startDevServer).not.toHaveBeenCalled();
  });

  it('prints a repeated startup warning only once', async () => {
    getDevWarnings.mockResolvedValue([warning, warning]);
    vi.mocked(getBuildMatches).mockResolvedValue([
      match,
      { ...match, src: 'other.js', entrypoint: 'other.js' },
    ]);

    await server.updateBuildMatches({}, true);

    expect(getDevWarnings).toHaveBeenCalledTimes(2);
    expect(output.warn).toHaveBeenCalledExactlyOnceWith(warning);
  });

  it('does not warn when the builder has no startup warnings', async () => {
    getDevWarnings.mockResolvedValue([]);

    await server.updateBuildMatches({}, true);

    expect(output.warn).not.toHaveBeenCalled();
  });

  it('propagates invalid middleware configuration before starting a worker', async () => {
    getDevWarnings.mockRejectedValue(new Error('Unsupported runtime'));

    await expect(server.updateBuildMatches({}, true)).rejects.toThrow(
      'Unsupported runtime'
    );

    expect(output.warn).not.toHaveBeenCalled();
    expect(startDevServer).not.toHaveBeenCalled();
  });
});
