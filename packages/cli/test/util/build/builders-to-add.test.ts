import npa from 'npm-package-arg';
import { getBuildersToAdd } from '../../../src/util/build/builders-to-add';

describe('getBuildersToAdd', () => {
  it('should install with no tag', () => {
    const builders = ['@vercel/node', '@vercel/next'];
    const buildersToAdd = getBuildersToAdd(builders.map(b => npa(b)));
    expect([...buildersToAdd]).toEqual([
      '@vercel/node',
      '@vercel/next',
      '@vercel/build-utils',
    ]);
  });

  it('should skip all if already installed', () => {
    const builders = ['@vercel/node', '@vercel/next'];
    const pkg = {
      devDependencies: {
        '@vercel/node': '0.0.0',
        '@vercel/next': '0.0.0',
        '@vercel/build-utils': '0.0.0',
      },
    };
    const buildersToAdd = getBuildersToAdd(
      builders.map(b => npa(b)),
      pkg
    );
    expect([...buildersToAdd]).toEqual([]);
  });

  it('should skip one if already installed', () => {
    const builders = ['@vercel/node', '@vercel/next'];
    const pkg = {
      devDependencies: {
        '@vercel/next': '0.0.0',
        '@vercel/build-utils': '0.0.0',
      },
    };
    const buildersToAdd = getBuildersToAdd(
      builders.map(b => npa(b)),
      pkg
    );
    expect([...buildersToAdd]).toEqual(['@vercel/node']);
  });

  it('should upgrade if a specific version is specified', () => {
    const builders = ['@vercel/next@0.0.1'];
    const pkg = {
      devDependencies: {
        '@vercel/next': '0.0.0',
        '@vercel/build-utils': '0.0.0',
      },
    };
    const buildersToAdd = getBuildersToAdd(
      builders.map(b => npa(b)),
      pkg
    );
    expect([...buildersToAdd]).toEqual(['@vercel/next@0.0.1']);
  });
});
