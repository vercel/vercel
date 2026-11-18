import { afterEach, describe, expect, it } from 'vitest';
import { getDefaultArchitecture } from '../../src/lib/compile';

const hostArch = process.arch;

function setHostArch(arch: string) {
  Object.defineProperty(process, 'arch', { value: arch });
}

describe('getDefaultArchitecture', () => {
  afterEach(() => {
    setHostArch(hostArch);
  });

  it('follows an arm64 host, where cargo builds an arm64 binary', () => {
    setHostArch('arm64');
    expect(getDefaultArchitecture(false)).toBe('arm64');
  });

  it('is x86_64 on an x64 host', () => {
    setHostArch('x64');
    expect(getDefaultArchitecture(false)).toBe('x86_64');
  });

  it('is x86_64 when cross-compiling from an arm64 machine', () => {
    setHostArch('arm64');
    expect(getDefaultArchitecture(true)).toBe('x86_64');
  });
});
