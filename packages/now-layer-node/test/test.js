/* global jest, expect, it */
jest.setTimeout(30 * 1000);
const { buildLayer } = require('../');

describe('buildLayer', () => {
  it('should get node 10 and metadata for windows', async () => {
    const { files, entrypoint } = await buildLayer({
      runtimeVersion: '10.16.0',
      platform: 'win32',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(names.size).toBeGreaterThan(0);
    expect(entrypoint).toBe('bin/node.exe');
    expect(names.has('bin/node.exe')).toBeTruthy();
    expect(names.has('bin/npm.cmd')).toBeFalsy();
    expect(names.has('bin/npx.cmd')).toBeFalsy();
    expect(names.has('bin/node_modules')).toBeFalsy();
  });

  it('should get node 10 and metadata for macos', async () => {
    const { files, entrypoint } = await buildLayer({
      runtimeVersion: '10.16.0',
      platform: 'darwin',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(names.size).toBeGreaterThan(0);
    expect(entrypoint).toBe('bin/node');
    expect(names.has('bin/node')).toBeTruthy();
    expect(names.has('bin/npm')).toBeFalsy();
    expect(names.has('bin/npx')).toBeFalsy();
    expect(names.has('lib/node_modules')).toBeFalsy();
  });

  it('should get node 10 and metadata for linux', async () => {
    const { files, entrypoint } = await buildLayer({
      runtimeVersion: '10.16.0',
      platform: 'linux',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(names.size).toBeGreaterThan(0);
    expect(entrypoint).toBe('bin/node');
    expect(names.has('bin/node')).toBeTruthy();
    expect(names.has('include/node/node.h')).toBeTruthy();
    expect(names.has('bin/npm')).toBeFalsy();
    expect(names.has('bin/npx')).toBeFalsy();
    expect(names.has('lib/node_modules')).toBeFalsy();
  });
});
