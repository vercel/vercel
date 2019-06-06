/* global jest, expect, it */
jest.setTimeout(30 * 1000);
const { buildLayer } = require('../');

describe('buildLayer', () => {
  it('should get yarn for windows', async () => {
    const { files, entrypoint } = await buildLayer({
      runtimeVersion: '1.16.0',
      platform: 'win32',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(entrypoint).toBe('./bin/yarn.js');
    expect(names.size).toBeGreaterThan(0);
    expect(names.has('bin/yarn.cmd')).toBeTruthy();
    expect(names.has('lib/cli.js')).toBeTruthy();
  });

  it('should get yarn for macos', async () => {
    const { files, entrypoint } = await buildLayer({
      runtimeVersion: '1.16.0',
      platform: 'darwin',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(entrypoint).toBe('./bin/yarn.js');
    expect(names.size).toBeGreaterThan(0);
    expect(names.has('bin/yarn')).toBeTruthy();
    expect(names.has('lib/cli.js')).toBeTruthy();
    expect(names.has('README.md')).toBeFalsy();
  });

  it('should get yarn for linux', async () => {
    const { files, entrypoint } = await buildLayer({
      runtimeVersion: '1.16.0',
      platform: 'linux',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(entrypoint).toBe('./bin/yarn.js');
    expect(names.size).toBeGreaterThan(0);
    expect(names.has('bin/yarn')).toBeTruthy();
    expect(names.has('lib/cli.js')).toBeTruthy();
    expect(names.has('README.md')).toBeFalsy();
  });
});
