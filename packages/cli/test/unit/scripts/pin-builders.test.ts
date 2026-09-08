import { describe, expect, it } from 'vitest';
import { join } from 'path';
import {
  getBuildUtilsSpec,
  getWorkspaceVersions,
  pinBuilders,
  previewTarballFilename,
} from '../../../scripts/pin-builders.mjs';

const versions = new Map([
  ['@vercel/node', '5.8.26'],
  ['@vercel/next', '4.20.4'],
  ['@vercel/build-utils', '8.0.0'],
]);

describe('previewTarballFilename()', () => {
  it('flattens scoped names so URLs contain neither @ nor %40', () => {
    expect(previewTarballFilename('@vercel/node')).toBe('vercel-node.tgz');
    expect(previewTarballFilename('execa')).toBe('execa.tgz');
  });
});

describe('getBuildUtilsSpec()', () => {
  it('uses the preview tarball URL already written by utils/pack.ts', () => {
    const url = 'https://preview.vercel.sh/tarballs/vercel-build-utils.tgz';
    expect(
      getBuildUtilsSpec(
        { dependencies: { '@vercel/build-utils': url } },
        versions
      )
    ).toBe(url);
  });

  it('resolves workspace markers to the exact workspace version', () => {
    expect(
      getBuildUtilsSpec(
        { dependencies: { '@vercel/build-utils': 'workspace:*' } },
        versions
      )
    ).toBe('8.0.0');
  });
});

describe('pinBuilders()', () => {
  it('pins workspace markers to exact versions', () => {
    const pkg = {
      name: 'vercel',
      builders: {
        '@vercel/node': 'workspace:*',
        '@vercel/next': 'workspace:*',
      },
    };
    expect(pinBuilders(pkg, versions).builders).toEqual({
      '@vercel/node': '5.8.26',
      '@vercel/next': '4.20.4',
    });
  });

  it('passes through entries that are not workspace markers', () => {
    const pkg = {
      name: 'vercel',
      builders: {
        '@vercel/node': 'https://example.com/tarballs/%40vercel/node.tgz',
        '@vercel/next': 'workspace:*',
      },
    };
    expect(pinBuilders(pkg, versions).builders).toEqual({
      '@vercel/node': 'https://example.com/tarballs/%40vercel/node.tgz',
      '@vercel/next': '4.20.4',
    });
  });

  it('pins workspace markers to preview tarballs when provided', () => {
    const pkg = {
      name: 'vercel',
      builders: {
        '@vercel/node': 'workspace:*',
        '@vercel/next': 'workspace:*',
      },
    };
    expect(
      pinBuilders(pkg, versions, 'https://preview.vercel.sh/tarballs/').builders
    ).toEqual({
      '@vercel/node': 'https://preview.vercel.sh/tarballs/vercel-node.tgz',
      '@vercel/next': 'https://preview.vercel.sh/tarballs/vercel-next.tgz',
    });
  });

  it('throws when a builder is not in the workspace', () => {
    const pkg = {
      name: 'vercel',
      builders: { '@vercel/missing': 'workspace:*' },
    };
    expect(() => pinBuilders(pkg, versions)).toThrow(
      'Builder "@vercel/missing" not found in the workspace'
    );
  });

  it('throws when the workspace version is not exact', () => {
    const pkg = { name: 'vercel', builders: { '@vercel/node': 'workspace:*' } };
    expect(() =>
      pinBuilders(pkg, new Map([['@vercel/node', 'workspace:*']]))
    ).toThrow('non-exact workspace version');
  });

  it('throws when the builders manifest is missing', () => {
    expect(() => pinBuilders({ name: 'vercel' }, versions)).toThrow(
      'no `builders` manifest'
    );
  });

  it('resolves every builders entry from the real workspace', () => {
    const cliRoot = join(__dirname, '../../..');
    const pkg = JSON.parse(
      JSON.stringify(require(join(cliRoot, 'package.json')))
    );
    const packagesRoot = join(cliRoot, '..');
    const workspaceVersions = getWorkspaceVersions(packagesRoot);
    const pinned = pinBuilders(pkg, workspaceVersions).builders;
    for (const [name, version] of Object.entries(pinned)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+/);

      const packageDir = name.replace('@vercel/remix-builder', '@vercel/remix');
      const builderPkg = require(
        join(packagesRoot, packageDir.split('/')[1], 'package.json')
      );
      expect(builderPkg.peerDependencies?.['@vercel/build-utils'], name).toBe(
        'workspace:*'
      );
      expect(builderPkg.devDependencies?.['@vercel/build-utils'], name).toBe(
        'workspace:*'
      );
    }
  });
});
