import { afterEach, describe, expect, it, vi } from 'vitest';
import { realpathSync } from 'fs';
import { sep } from 'path';
import { getNativeInstallMethod } from '../../../src/util/native-install';

vi.mock('fs', async importActual => {
  const actual = await importActual<typeof import('fs')>();
  return { ...actual, realpathSync: vi.fn() };
});

const realpathMock = vi.mocked(realpathSync);

describe('getNativeInstallMethod', () => {
  afterEach(() => {
    realpathMock.mockReset();
  });

  it('detects npm installs by their node_modules path', () => {
    const npmPath = [
      '',
      'usr',
      'local',
      'lib',
      'node_modules',
      '@vercel',
      'vc-native',
      'bin',
      'vercel',
    ].join(sep);
    realpathMock.mockReturnValue(npmPath);

    expect(getNativeInstallMethod()).toBe('npm');
  });

  it('detects npm fallback installs through a platform package', () => {
    const npmPath = [
      '',
      'usr',
      'local',
      'lib',
      'node_modules',
      '@vercel',
      'vc-native-linux-x64',
      'bin',
      'vercel',
    ].join(sep);
    realpathMock.mockReturnValue(npmPath);

    expect(getNativeInstallMethod()).toBe('npm');
  });

  it('detects pnpm fallback installs through a platform package', () => {
    const pnpmPath = [
      '',
      'home',
      'user',
      '.local',
      'share',
      'pnpm',
      'global',
      '5',
      'node_modules',
      '.pnpm',
      '@vercel+vc-native-linux-x64@1.0.0',
      'node_modules',
      '@vercel',
      'vc-native-linux-x64',
      'bin',
      'vercel',
    ].join(sep);
    realpathMock.mockReturnValue(pnpmPath);

    expect(getNativeInstallMethod()).toBe('npm');
  });

  it('treats other locations as standalone', () => {
    const standalonePath = [
      '',
      'home',
      'user',
      '.vercel',
      'bin',
      'vercel',
    ].join(sep);
    realpathMock.mockReturnValue(standalonePath);

    expect(getNativeInstallMethod()).toBe('standalone');
  });

  it('falls back to npm when the path cannot be resolved', () => {
    realpathMock.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(getNativeInstallMethod()).toBe('npm');
  });
});
