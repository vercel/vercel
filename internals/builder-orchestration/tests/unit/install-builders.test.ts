import { describe, expect, it } from 'vitest';
import {
  getBuildUtilsSpec,
  getBuildUtilsVersionForInstall,
  shouldFallbackBuilderPins,
} from '../../src/install-builders';

describe('shouldFallbackBuilderPins', () => {
  it('does not fall back when binary pins are strict', () => {
    expect(shouldFallbackBuilderPins({ strictBuilderPins: true }, 1)).toBe(
      false
    );
  });

  it('retains fallback for non-strict installs with managed pins', () => {
    expect(shouldFallbackBuilderPins({}, 1)).toBe(true);
  });

  it('does not fall back when no spec was pinned', () => {
    expect(shouldFallbackBuilderPins({}, 0)).toBe(false);
  });
});

describe('getBuildUtilsVersionForInstall', () => {
  const dependencies = {
    buildUtilsVersion: '14.5.0',
    pinnedBuildUtilsVersion:
      'https://preview.vercel.sh/tarballs/vercel-build-utils.tgz',
  };

  it('uses the published version for unpinned builders and fallbacks', () => {
    expect(getBuildUtilsVersionForInstall(dependencies, false)).toBe('14.5.0');
  });

  it('uses the matching preview tarball for pinned preview builders', () => {
    expect(getBuildUtilsVersionForInstall(dependencies, true)).toBe(
      dependencies.pinnedBuildUtilsVersion
    );
  });

  it('uses the published version when there is no separate preview tarball', () => {
    expect(
      getBuildUtilsVersionForInstall({ buildUtilsVersion: '14.5.0' }, true)
    ).toBe('14.5.0');
  });
});

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
