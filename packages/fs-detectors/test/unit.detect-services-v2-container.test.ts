import { join } from 'path';
import { detectServices, LocalFileSystemDetector } from '../src';
import type { ExperimentalServiceV2 } from '../src';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'services-container');

function servicesV2(services: { schema: string }[]): ExperimentalServiceV2[] {
  return services.filter(
    (s): s is ExperimentalServiceV2 => s.schema === 'experimentalServicesV2'
  );
}

async function detectFixture(fixture: string) {
  const fs = new LocalFileSystemDetector(join(FIXTURES_DIR, fixture));
  return detectServices({ fs });
}

/**
 * Container service detection for `experimentalServicesV2` / `services`.
 *
 * Each case is backed by a fixture directory under
 * `test/fixtures/services-container/`. The directory name encodes the scenario
 * and whether it should pass or fail (`pass-*` / `fail-*`), so the fixtures can
 * be shared and inspected on their own.
 *
 * Rules under test:
 *   - A supplied `entrypoint` named `Dockerfile`, `Containerfile`, or anything
 *     prefixed `Dockerfile.` / `Containerfile.` infers `runtime: "container"`.
 *   - `runtime: "container"` with no `entrypoint` auto-detects one of the four
 *     blessed names (`Dockerfile`, `Containerfile`, `Dockerfile.vercel`,
 *     `Containerfile.vercel`) in the service root.
 *   - There is no prebuilt-image-reference entrypoint anymore.
 */
describe('detectServices (services) — container detection', () => {
  describe('success cases', () => {
    it.each([
      // [fixture directory, expected resolved entrypoint, expected builder.src]
      ['pass-entrypoint-dockerfile', 'Dockerfile', 'Dockerfile'],
      ['pass-entrypoint-containerfile', 'Containerfile', 'Containerfile'],
      [
        'pass-entrypoint-containerfile-vercel',
        'Containerfile.vercel',
        'Containerfile.vercel',
      ],
      ['pass-runtime-autodetect-dockerfile', 'Dockerfile', 'Dockerfile'],
      [
        'pass-runtime-autodetect-vercel-marker',
        'Dockerfile.vercel',
        'Dockerfile.vercel',
      ],
      ['pass-runtime-and-entrypoint', 'Dockerfile', 'Dockerfile'],
    ])('resolves %s to @vercel/container', async (fixture, expectedEntrypoint, expectedSrc) => {
      const result = await detectFixture(fixture);

      expect(result.errors).toEqual([]);
      const [svc] = servicesV2(result.services);
      expect(svc).toMatchObject({
        schema: 'experimentalServicesV2',
        root: '.',
        runtime: 'container',
        entrypoint: expectedEntrypoint,
      });
      expect(svc.builder.use).toBe('@vercel/container');
      expect(svc.builder.src).toBe(expectedSrc);
      // Images are gone: no prebuilt-image handler should ever be set.
      expect(svc.builder.config).not.toHaveProperty('handler');
    });

    it('prefers a .vercel marker over a plain Dockerfile when auto-detecting', async () => {
      // Root contains both `Dockerfile.vercel` and `Dockerfile`. The `.vercel`
      // opt-in marker must win.
      const result = await detectFixture(
        'pass-runtime-autodetect-vercel-precedence'
      );

      expect(result.errors).toEqual([]);
      const [svc] = servicesV2(result.services);
      expect(svc.runtime).toBe('container');
      expect(svc.entrypoint).toBe('Dockerfile.vercel');
      expect(svc.builder.use).toBe('@vercel/container');
      expect(svc.builder.src).toBe('Dockerfile.vercel');
    });

    it('resolves a container service under a non-root service root', async () => {
      const result = await detectFixture('pass-nonroot-root');

      expect(result.errors).toEqual([]);
      const [svc] = servicesV2(result.services);
      expect(svc).toMatchObject({
        root: 'apps/api',
        runtime: 'container',
        entrypoint: 'Dockerfile',
      });
      expect(svc.builder.use).toBe('@vercel/container');
      expect(svc.builder.src).toBe('apps/api/Dockerfile');
      expect(svc.builder.config).toMatchObject({ workspace: 'apps/api' });
    });
  });

  describe('failure cases', () => {
    it('errors when runtime: container has no entrypoint and no Dockerfile is present', async () => {
      const result = await detectFixture('fail-runtime-no-dockerfile');

      expect(servicesV2(result.services)).toEqual([]);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_SERVICE_CONFIG',
        serviceName: 'app',
      });
    });

    it('errors when runtime: container entrypoint is not a Dockerfile', async () => {
      const result = await detectFixture(
        'fail-runtime-entrypoint-not-dockerfile'
      );

      expect(servicesV2(result.services)).toEqual([]);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_SERVICE_CONFIG',
        serviceName: 'app',
      });
    });

    it('rejects a suffixed Dockerfile.* entrypoint (only bare and .vercel are allowed)', async () => {
      // `Dockerfile.prod` is not one of the blessed names, so a container
      // service entrypoint pointing at it is rejected rather than built.
      const result = await detectFixture('fail-entrypoint-dockerfile-suffix');

      expect(servicesV2(result.services)).toEqual([]);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_SERVICE_CONFIG',
        serviceName: 'app',
      });
    });

    it('does not auto-detect a non-blessed Dockerfile.* when only runtime is set', async () => {
      // Only a `Dockerfile.prod` is present. Auto-detection considers just the
      // four blessed names, so this must error rather than silently pick it up.
      const result = await detectFixture(
        'fail-runtime-autodetect-ignores-suffix'
      );

      expect(servicesV2(result.services)).toEqual([]);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_SERVICE_CONFIG',
        serviceName: 'app',
      });
    });
  });
});
