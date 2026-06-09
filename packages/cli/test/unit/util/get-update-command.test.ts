import { afterEach, describe, expect, it, vi } from 'vitest';
import getUpdateCommand, {
  getUpdatePackageName,
  isGlobal,
} from '../../../src/util/get-update-command';
import * as nativeInstall from '../../../src/util/native-install';

describe('getUpdateCommand', () => {
  const originalVercelVcNative = process.env.VERCEL_VC_NATIVE;

  afterEach(() => {
    if (originalVercelVcNative === undefined) {
      delete process.env.VERCEL_VC_NATIVE;
    } else {
      process.env.VERCEL_VC_NATIVE = originalVercelVcNative;
    }
  });

  it('should detect update command', async () => {
    delete process.env.VERCEL_VC_NATIVE;

    const updateCommand = await getUpdateCommand();
    if (await isGlobal()) {
      expect(updateCommand).toEqual(`pnpm i -g vercel@latest`);
    } else {
      expect(updateCommand).toEqual(`pnpm i vercel@latest`);
    }
  });

  it('should update the native package when running through vc-native', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    const methodSpy = vi
      .spyOn(nativeInstall, 'getNativeInstallMethod')
      .mockReturnValue('npm');

    const updateCommand = await getUpdateCommand();

    expect(updateCommand).toContain('@vercel/vc-native@latest');
    expect(updateCommand.split(' ')).not.toContain('vercel@latest');
    methodSpy.mockRestore();
  });

  it('should self-upgrade for standalone native installs', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    const methodSpy = vi
      .spyOn(nativeInstall, 'getNativeInstallMethod')
      .mockReturnValue('standalone');

    const updateCommand = await getUpdateCommand();

    expect(updateCommand).toBe('vercel upgrade');
    methodSpy.mockRestore();
  });

  describe('getUpdatePackageName', () => {
    it('returns the node package by default', () => {
      delete process.env.VERCEL_VC_NATIVE;
      expect(getUpdatePackageName()).toEqual('vercel');
    });

    it('returns the native package when running through vc-native', () => {
      process.env.VERCEL_VC_NATIVE = '1';
      expect(getUpdatePackageName()).toEqual('@vercel/vc-native');
    });
  });
});
