import type { BuildOptions, BuilderV2 } from '@vercel/build-utils';
import { Span } from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import { describe, expect, it } from 'vitest';
import { executeBuilder } from '@vercel-internals/cli-builder-integration';

/**
 * The Ruby preset's `defaultRoutes` point at `/config`, the legacy Lambda
 * output named after its `config.ru` entrypoint. They are only a fallback for
 * builders that return no routes of their own: the buildpack build
 * (`@vercel/container`) always returns a catch-all to its `container` output
 * with a request-path transform, so the preset never has to know which
 * builder ran.
 */
describe('framework default routes at the execution boundary', () => {
  const ruby = frameworkList.find(f => f.slug === 'ruby');
  // A span is traced once; give each build its own.
  const span = () => new Span({ name: 'test' });

  function buildOptions(entrypoint: string): BuildOptions {
    return {
      files: {},
      entrypoint,
      workPath: '/work',
      repoRootPath: '/work',
      config: { zeroConfig: true, framework: 'ruby' },
    };
  }

  it('injects the /config fallback for a legacy Ruby build that returns no routes', async () => {
    const legacyRuby: BuilderV2 = {
      version: 2,
      build: async () => ({ output: {} }),
    };

    const { buildResult } = await executeBuilder({
      builder: legacyRuby,
      buildOptions: buildOptions('config.ru'),
      span: span(),
      isFrontendBuilder: true,
      hasDetectedServices: false,
      framework: ruby,
    });

    expect(ruby?.defaultRoutes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/config' },
    ]);
    expect(buildResult).toEqual({
      output: {},
      routes: ruby?.defaultRoutes,
    });
  });

  it('keeps the routes a container buildpack build returns and never adds /config', async () => {
    // Mirrors the routes `@vercel/container` returns for every image build.
    const containerRoutes = [
      { handle: 'filesystem' as const },
      {
        src: '/(.*)',
        dest: '/container',
        transforms: [
          { type: 'request.path' as const, op: 'set' as const, args: '/$1' },
        ],
      },
    ];
    const container: BuilderV2 = {
      version: 2,
      build: async () => ({
        output: {},
        routes: containerRoutes,
      }),
    };

    const { buildResult } = await executeBuilder({
      builder: container,
      buildOptions: {
        ...buildOptions('<detect>'),
        config: { zeroConfig: true, framework: 'ruby', buildpack: 'ruby' },
      },
      span: span(),
      isFrontendBuilder: true,
      hasDetectedServices: false,
      framework: ruby,
    });

    expect(buildResult.routes).toBe(containerRoutes);
    expect(buildResult.routes).not.toContainEqual(
      expect.objectContaining({ dest: '/config' })
    );
  });

  it('never applies framework routes to detected services', async () => {
    const legacyRuby: BuilderV2 = {
      version: 2,
      build: async () => ({ output: {} }),
    };

    const { buildResult } = await executeBuilder({
      builder: legacyRuby,
      buildOptions: buildOptions('services/api/config.ru'),
      span: span(),
      isFrontendBuilder: true,
      hasDetectedServices: true,
      framework: ruby,
    });

    expect(buildResult).toEqual({ output: {} });
  });
});
