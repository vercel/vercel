import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  createInstallBuilders,
  getBuildUtilsSpec,
} from '../../src/install-builders';

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

describe('createInstallBuilders', () => {
  it('warns only on individual npm WARN deprecated lines from stderr', async () => {
    const buildersDir = await mkdtemp(join(tmpdir(), 'vc-builders-'));
    try {
      const warnings: string[] = [];
      const installBuilders = createInstallBuilders({
        code: value => value,
        cmd: value => value,
        isCantParseJSONFile: (value): value is Error => value instanceof Error,
        output: {
          debug: () => {},
          log: () => {},
          warn: message => {
            warnings.push(message);
          },
        },
        readJSONFile: async () => ({ dependencies: {} }),
        run: async () => ({
          stderr: [
            'npm warn EBADENGINE Unsupported engine',
            'npm WARN deprecated inflight@1.0.6: This module is not supported',
            'npm notice created a lockfile',
          ].join('\r\n'),
        }),
      });

      await installBuilders(buildersDir, new Set(['@vercel/node']));

      expect(warnings).toEqual([
        'npm WARN deprecated inflight@1.0.6: This module is not supported',
      ]);
    } finally {
      await rm(buildersDir, { recursive: true, force: true });
    }
  });
});
