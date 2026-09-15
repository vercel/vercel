import os from 'os';
import { realpathSync } from 'fs';
import { redirectGatsbyCachesToWritableDir } from '../templates/utils';

type GlobalWithGatsby = typeof globalThis & {
  __GATSBY?: { root?: string; [key: string]: unknown };
};

describe('redirectGatsbyCachesToWritableDir()', () => {
  const originalCwd = process.cwd();
  const originalGatsby = (global as GlobalWithGatsby).__GATSBY;

  afterEach(() => {
    process.chdir(originalCwd);
    (global as GlobalWithGatsby).__GATSBY = originalGatsby;
  });

  it('points cwd and Gatsby root at the OS temp dir', () => {
    const applied = redirectGatsbyCachesToWritableDir();
    const tmp = os.tmpdir();

    expect(applied).toBe(tmp);
    // realpath avoids macOS `/var` -> `/private/var` symlink differences in cwd
    expect(realpathSync(process.cwd())).toBe(realpathSync(tmp));
    expect((global as GlobalWithGatsby).__GATSBY?.root).toBe(tmp);
  });

  it('preserves existing fields on global.__GATSBY', () => {
    (global as GlobalWithGatsby).__GATSBY = { foo: 'bar' };

    redirectGatsbyCachesToWritableDir();

    expect((global as GlobalWithGatsby).__GATSBY?.foo).toBe('bar');
    expect((global as GlobalWithGatsby).__GATSBY?.root).toBe(os.tmpdir());
  });
});
