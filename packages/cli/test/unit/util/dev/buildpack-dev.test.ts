import { describe, expect, it } from 'vitest';
import type {
  ExperimentalService,
  ExperimentalServiceV2,
} from '@vercel/build-utils';
import { NowBuildError } from '@vercel/build-utils';
import {
  BUILDPACK_DEV_UNSUPPORTED,
  assertNoBuildpackServices,
  buildpackDevUnsupportedError,
  buildpackServicesDevUnsupportedError,
  getBuildpackRuntime,
} from '../../../../src/util/dev/buildpack-dev';

function rubyService(
  name: string,
  extra: Partial<ExperimentalServiceV2> = {}
): ExperimentalServiceV2 {
  return {
    schema: 'experimentalServicesV2',
    name,
    root: `services/${name}`,
    framework: 'ruby',
    runtime: 'ruby',
    builder: {
      src: `services/${name}/<detect>`,
      use: '@vercel/container',
      config: {
        zeroConfig: true,
        framework: 'ruby',
        buildpack: 'ruby',
        workspace: `services/${name}`,
      },
    },
    ...extra,
  };
}

describe('getBuildpackRuntime', () => {
  it('returns the runtime a buildpack builder selects', () => {
    expect(
      getBuildpackRuntime({ config: { buildpack: 'ruby', framework: 'ruby' } })
    ).toBe('ruby');
  });

  it('returns undefined for builders that do not select a buildpack', () => {
    expect(getBuildpackRuntime(undefined)).toBeUndefined();
    expect(getBuildpackRuntime({})).toBeUndefined();
    expect(
      getBuildpackRuntime({ config: { framework: 'ruby' } })
    ).toBeUndefined();
    expect(getBuildpackRuntime({ config: { buildpack: '' } })).toBeUndefined();
  });
});

// The buildpack is an implementation detail the user never chose; the errors
// name the language and the project or services, and nothing else.
const REMOVED_WORDING =
  /buildpack|bundle exec|rackup|prebuilt|Development Command|devCommand/i;

describe('buildpackDevUnsupportedError', () => {
  it('says the runtime is not supported yet, by its display name', () => {
    const err = buildpackDevUnsupportedError('ruby');
    expect(err).toBeInstanceOf(NowBuildError);
    expect(err.code).toBe(BUILDPACK_DEV_UNSUPPORTED);
    expect(err.message).toBe("`vercel dev` doesn't support Ruby projects yet.");
    expect(err.message).not.toMatch(REMOVED_WORDING);
  });

  it('falls back to the runtime slug when no preset shares it', () => {
    expect(buildpackDevUnsupportedError('zig').message).toBe(
      "`vercel dev` doesn't support zig projects yet."
    );
  });
});

describe('buildpackServicesDevUnsupportedError', () => {
  it('names a single service', () => {
    const err = buildpackServicesDevUnsupportedError([
      { name: 'red', runtime: 'ruby' },
    ]);
    expect(err.code).toBe(BUILDPACK_DEV_UNSUPPORTED);
    expect(err.message).toBe(
      '`vercel dev` doesn\'t support the Ruby service "red" yet.'
    );
    expect(err.message).not.toMatch(REMOVED_WORDING);
  });

  it('lists every blocked service', () => {
    const err = buildpackServicesDevUnsupportedError([
      { name: 'red', runtime: 'ruby' },
      { name: 'blue', runtime: 'ruby' },
      { name: 'green', runtime: 'ruby' },
    ]);
    expect(err.message).toBe(
      '`vercel dev` doesn\'t support the Ruby services "red", "blue" and "green" yet.'
    );
    expect(err.message).not.toMatch(REMOVED_WORDING);
  });
});

describe('assertNoBuildpackServices', () => {
  it('rejects buildpack services', () => {
    expect(() =>
      assertNoBuildpackServices([rubyService('red'), rubyService('blue')])
    ).toThrow(/the Ruby services "red" and "blue" yet/);
  });

  it('rejects a buildpack service even when it declares a devCommand', () => {
    // A `devCommand` does not make the build runnable yet; support for it
    // comes later.
    expect(() =>
      assertNoBuildpackServices([
        rubyService('red', { devCommand: 'bundle exec rackup -p $PORT' }),
      ])
    ).toThrow(/the Ruby service "red" yet/);
  });

  it('reports every buildpack service, with or without a devCommand', () => {
    expect(() =>
      assertNoBuildpackServices([
        rubyService('red', { devCommand: 'bundle exec rackup -p $PORT' }),
        rubyService('blue'),
      ])
    ).toThrow(/the Ruby services "red" and "blue" yet/);
  });

  it('ignores services that do not build with a buildpack', () => {
    const python: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'api',
      root: 'api',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
      builder: { use: '@vercel/python', src: 'api/pyproject.toml' },
    };
    const container: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'web',
      root: 'web',
      runtime: 'container',
      entrypoint: 'Dockerfile.vercel',
      builder: { use: '@vercel/container', src: 'web/Dockerfile.vercel' },
    };
    const legacy: ExperimentalService = {
      schema: 'experimentalServices',
      name: 'worker',
      type: 'worker',
      workspace: 'worker',
      runtime: 'python',
      builder: { use: '@vercel/python', src: 'worker.py' },
    };
    expect(() =>
      assertNoBuildpackServices([python, container, legacy])
    ).not.toThrow();
  });

  it('rejects a legacy experimentalServices entry routed to a buildpack', () => {
    const legacy: ExperimentalService = {
      schema: 'experimentalServices',
      name: 'red',
      type: 'web',
      workspace: 'services/red',
      framework: 'ruby',
      runtime: 'ruby',
      builder: {
        use: '@vercel/container',
        src: 'services/red/<detect>',
        config: { buildpack: 'ruby' },
      },
    };
    expect(() => assertNoBuildpackServices([legacy])).toThrow(
      /the Ruby service "red" yet/
    );
  });
});
