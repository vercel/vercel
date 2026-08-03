import { frameworkList } from '@vercel/frameworks';
import { describe, expect, it } from 'vitest';
// Monorepo-relative import on purpose: fs-detectors must not depend on
// `@vercel/container` at runtime, but the two packages share the set of
// buildpack-backed runtimes and this test keeps them from drifting.
import { BUILDPACKS } from '../../container/src/buildpacks/registry';
import { BUILDPACK_RUNTIMES } from '../src/services/types';

/**
 * `BUILDPACK_RUNTIMES` (fs-detectors — routes services/frameworks to
 * `@vercel/container`) and the `BUILDPACKS` registry (`@vercel/container` —
 * drives the CNB lifecycle) are maintained by hand in two packages. A
 * runtime present in one but not the other produces confusing failures:
 * either services resolve to `@vercel/container` with no descriptor to
 * build with, or a descriptor exists that nothing can ever select.
 */
describe('buildpack runtime registry sync', () => {
  const registrySlugs = BUILDPACKS.map(bp => bp.runtime).sort();
  const detectorSlugs = [...BUILDPACK_RUNTIMES].sort();

  it('every fs-detectors buildpack runtime has a container descriptor', () => {
    expect(registrySlugs).toEqual(expect.arrayContaining(detectorSlugs));
  });

  it('every container descriptor is a known fs-detectors buildpack runtime', () => {
    expect(detectorSlugs).toEqual(expect.arrayContaining(registrySlugs));
  });

  it('every descriptor framework slug maps to a framework preset', () => {
    const presetSlugs = new Set(frameworkList.map(f => f.slug));
    for (const bp of BUILDPACKS) {
      for (const slug of bp.frameworkSlugs ?? [bp.runtime]) {
        expect(presetSlugs).toContain(slug);
      }
    }
  });

  it('framework preset detectors require each descriptor project marker', () => {
    for (const bp of BUILDPACKS) {
      for (const slug of bp.frameworkSlugs ?? [bp.runtime]) {
        const preset = frameworkList.find(f => f.slug === slug);
        const detectorPaths = [
          ...(preset?.detectors?.every ?? []),
          ...(preset?.detectors?.some ?? []),
        ].map(d => d.path);
        // Markers are any-of; the preset must be able to see at least one so
        // zero-config detection never selects an unbuildable project.
        expect(
          bp.projectMarkers.some(marker => detectorPaths.includes(marker)),
          `framework preset "${slug}" detectors ${JSON.stringify(
            detectorPaths
          )} reference none of ${JSON.stringify(bp.projectMarkers)}`
        ).toBe(true);
      }
    }
  });
});
