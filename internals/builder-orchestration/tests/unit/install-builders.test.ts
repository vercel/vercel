import { describe, expect, it } from 'vitest';
import { getBuildUtilsSpec } from '../../src/install-builders';

describe('getBuildUtilsSpec', () => {
  it('uses the CLI dependency version', () => {
    expect(getBuildUtilsSpec('14.5.0')).toBe('@vercel/build-utils@14.5.0');
  });

  it('uses the CLI preview tarball', () => {
    expect(
      getBuildUtilsSpec(
        'https://preview.vercel.sh/tarballs/vercel-build-utils.tgz'
      )
    ).toBe(
      '@vercel/build-utils@https://preview.vercel.sh/tarballs/vercel-build-utils.tgz'
    );
  });

  it('ignores the workspace protocol from a source checkout', () => {
    expect(getBuildUtilsSpec('workspace:*')).toBe('@vercel/build-utils');
  });

  it('falls back to the latest package when the CLI has no dependency', () => {
    expect(getBuildUtilsSpec()).toBe('@vercel/build-utils');
  });
});
