import { frameworkList } from '@vercel/frameworks';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Monorepo-relative import on purpose: fs-detectors must not depend on
// `@vercel/container` at runtime, but the two packages share the set of
// buildpack-backed runtimes and this test keeps them from drifting.
import { BUILDPACKS } from '../../container/src/buildpacks/registry';
import { BUILDPACK_PROJECT_MARKERS } from '../src/buildpack-runtimes';
import {
  detectBuilders,
  detectFramework,
  detectServices,
  LocalFileSystemDetector,
} from '../src';
import VirtualFilesystem from './virtual-file-system';

/**
 * `BUILDPACK_PROJECT_MARKERS` (fs-detectors — routes services/frameworks to
 * `@vercel/container`) and the `BUILDPACKS` registry (`@vercel/container` —
 * drives the CNB lifecycle) are maintained by hand in two packages. A
 * runtime present in one but not the other produces confusing failures:
 * either services resolve to `@vercel/container` with no descriptor to
 * build with, or a descriptor exists that nothing can ever select. Markers
 * that differ would route a project the buildpack then refuses to build.
 */
describe('buildpack runtime registry sync', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists the same runtimes with the same project markers as the container registry', () => {
    const registry = Object.fromEntries(
      BUILDPACKS.map(bp => [bp.runtime, [...bp.projectMarkers].sort()])
    );
    const detectors = Object.fromEntries(
      [...BUILDPACK_PROJECT_MARKERS].map(([runtime, markers]) => [
        runtime,
        [...markers].sort(),
      ])
    );
    expect(detectors).toEqual(registry);
  });

  /**
   * The preset's detector decides *whether* a project is detected as the
   * runtime; the descriptor's `projectMarkers` are what the buildpack needs
   * to build it. A project the preset detects must therefore always carry one
   * of the descriptor's markers. The markers alone must not be enough: a
   * Gemfile also marks Ruby static-site generators and `api/*.rb` function
   * projects, which keep their own builders.
   */
  it('every descriptor runtime is detected from a project carrying its markers when enabled', async () => {
    const detect = (files: string[]) =>
      detectFramework({
        fs: new VirtualFilesystem(
          Object.fromEntries(files.map(file => [file, '']))
        ),
        frameworkList,
        useExperimentalFrameworks: false,
      });

    for (const bp of BUILDPACKS) {
      vi.stubEnv(
        `VERCEL_EXPERIMENTAL_BUILDPACK_${bp.runtime.toUpperCase()}`,
        '1'
      );
      const preset = frameworkList.find(f => f.slug === bp.runtime);
      const every = (preset?.detectors?.every ?? []).map(d => d.path!);
      const some = (preset?.detectors?.some ?? []).map(d => d.path!);
      expect(every.length + some.length, bp.runtime).toBeGreaterThan(0);

      expect(
        bp.projectMarkers.some(marker => every.includes(marker)),
        `${bp.runtime}: preset must require one of ${bp.projectMarkers.join(', ')}`
      ).toBe(true);

      expect(
        await detect([...bp.projectMarkers]),
        `${bp.runtime}: markers alone`
      ).not.toBe(bp.runtime);

      if (some.length > 0) {
        for (const alternative of some) {
          expect(
            await detect([...every, alternative]),
            `${bp.runtime}: ${alternative}`
          ).toBe(bp.runtime);
        }
      } else {
        expect(await detect(every)).toBe(bp.runtime);
      }
    }
  });

  it('resolves the Rust services deployment to a buildpack backend next to a static frontend', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUST', '1');
    const result = await detectServices({
      fs: new LocalFileSystemDetector(
        join(__dirname, '../../container/test/fixtures/rust/02-services')
      ),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.services).toHaveLength(2);
    expect(
      result.services.find(service => service.name === 'backend')
    ).toMatchObject({
      schema: 'experimentalServicesV2',
      root: 'backend',
      framework: undefined,
      runtime: 'rust',
      entrypoint: undefined,
      builder: {
        src: 'backend/<detect>',
        use: '@vercel/container',
        config: { buildpack: 'rust', workspace: 'backend' },
      },
    });
    expect(
      result.services.find(service => service.name === 'frontend')
    ).toMatchObject({
      root: 'frontend',
      runtime: undefined,
      builder: { use: '@vercel/static' },
    });
  });

  it('resolves the Go services deployment to buildpack backends next to a static frontend', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_GO', '1');
    const result = await detectServices({
      fs: new LocalFileSystemDetector(
        join(__dirname, '../../container/test/fixtures/go/04-services')
      ),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.services).toHaveLength(3);
    const service = (name: string) =>
      result.services.find(candidate => candidate.name === name);
    // The explicit `main.go` entrypoint names the package to build.
    expect(service('backend')).toMatchObject({
      schema: 'experimentalServicesV2',
      root: 'backend',
      framework: 'go',
      runtime: 'go',
      entrypoint: 'main.go',
      builder: {
        src: 'backend/<detect>',
        use: '@vercel/container',
        config: {
          buildpack: 'go',
          buildpackEntrypoint: 'main.go',
          workspace: 'backend',
        },
      },
    });
    // `runtime: "go"` alone: the build picks `cmd/server` like `@vercel/go`.
    expect(service('admin')).toMatchObject({
      root: 'admin',
      framework: 'go',
      runtime: 'go',
      entrypoint: undefined,
      builder: {
        src: 'admin/<detect>',
        use: '@vercel/container',
        config: { buildpack: 'go', workspace: 'admin' },
      },
    });
    expect(service('admin')?.builder.config).not.toHaveProperty(
      'buildpackEntrypoint'
    );
    expect(service('frontend')).toMatchObject({
      root: 'frontend',
      runtime: undefined,
      builder: { use: '@vercel/static' },
    });
  });

  it('keeps a Go api functions project on @vercel/go', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_GO', '1');
    const files = ['api/hello.go', 'go.mod', 'vercel.json'];
    // A root go.mod without a preset entrypoint: the project is
    // framework-less, and its handler builds as a function exactly as
    // without the flag.
    const framework = await detectFramework({
      fs: new VirtualFilesystem(
        Object.fromEntries(files.map(file => [file, '']))
      ),
      frameworkList,
    });
    expect(framework).toBeNull();
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings: { framework },
    });
    expect(errors).toBeNull();
    expect(builders).toContainEqual({
      src: 'api/hello.go',
      use: '@vercel/go',
      config: { zeroConfig: true },
    });
    expect(builders?.some(builder => builder.use === '@vercel/container')).toBe(
      false
    );
  });

  it('resolves the compact services deployment into separate buildpack roots', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const result = await detectServices({
      fs: new LocalFileSystemDetector(
        join(__dirname, '../../container/test/fixtures/ruby/02-services')
      ),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.services).toHaveLength(2);
    for (const name of ['red', 'blue']) {
      expect(
        result.services.find(service => service.name === name)
      ).toMatchObject({
        schema: 'experimentalServicesV2',
        root: `services/${name}`,
        framework: 'ruby',
        runtime: 'ruby',
        builder: {
          src: `services/${name}/<detect>`,
          use: '@vercel/container',
          config: { buildpack: 'ruby', workspace: `services/${name}` },
        },
      });
    }
  });
});
