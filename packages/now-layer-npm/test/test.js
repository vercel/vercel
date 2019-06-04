/* global jest, expect, it */
jest.setTimeout(30 * 1000);
const { buildLayer } = require('../');

describe('buildLayer', () => {
  it('should get npm 6 but not npm for windows', async () => {
    const { files } = await buildLayer({
      runtimeVersion: '6.9.0',
      platform: 'win32',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(names.size).toBeGreaterThan(0);
    expect(names.has('bin/npm.cmd')).toBeTruthy();
    expect(names.has('bin/npx.cmd')).toBeTruthy();
    expect(names.has('README.md')).toBeFalsy();
  });

  it('should get npm 6 but not npm for macos', async () => {
    const { files } = await buildLayer({
      runtimeVersion: '6.9.0',
      platform: 'darwin',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(names.size).toBeGreaterThan(0);
    expect(names.has('bin/npm')).toBeTruthy();
    expect(names.has('bin/npx')).toBeTruthy();
    expect(names.has('README.md')).toBeFalsy();
  });

  it('should get npm 6 but not npm for linux', async () => {
    const { files } = await buildLayer({
      runtimeVersion: '6.9.0',
      platform: 'linux',
      arch: 'x64',
    });
    const names = new Set(Object.keys(files));
    expect(names).toBeTruthy();
    expect(names.size).toBeGreaterThan(0);
    expect(names.has('bin/npm')).toBeTruthy();
    expect(names.has('bin/npx')).toBeTruthy();
    expect(names.has('README.md')).toBeFalsy();
  });
});
