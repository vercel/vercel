import { describe, expect, it } from 'vitest';
import { join } from 'path';
import {
  getWorkspaceVersions,
  pinBuilders,
} from '../../../scripts/pin-builders.mjs';

const versions = new Map([
  ['@vercel/node', '5.8.26'],
  ['@vercel/next', '4.20.4'],
]);

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
    const workspaceVersions = getWorkspaceVersions(join(cliRoot, '..'));
    const pinned = pinBuilders(pkg, workspaceVersions).builders;
    for (const [name, version] of Object.entries(pinned)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});
