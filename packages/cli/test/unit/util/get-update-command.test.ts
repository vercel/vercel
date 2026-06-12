import { afterEach, describe, expect, it, vi } from 'vitest';
import { sep } from 'path';
import getUpdateCommand, {
  getUpdatePackageName,
  isGlobal,
} from '../../../src/util/get-update-command';
import * as nativeInstall from '../../../src/util/native-install';

describe('getUpdateCommand', () => {
  const originalVercelVcNative = process.env.VERCEL_VC_NATIVE;
  const originalPlatform = process.platform;

  function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
    });
  }

  afterEach(() => {
    if (originalVercelVcNative === undefined) {
      delete process.env.VERCEL_VC_NATIVE;
    } else {
      process.env.VERCEL_VC_NATIVE = originalVercelVcNative;
    }
    setPlatform(originalPlatform);
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

  it('should self-upgrade for standalone native installs on unix', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    setPlatform('linux');
    const methodSpy = vi
      .spyOn(nativeInstall, 'getNativeInstallMethod')
      .mockReturnValue('standalone');

    const updateCommand = await getUpdateCommand();

    expect(updateCommand).toBe('vercel upgrade');
    methodSpy.mockRestore();
  });

  it('uses the package manager for standalone native installs on windows', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    setPlatform('win32');
    const methodSpy = vi
      .spyOn(nativeInstall, 'getNativeInstallMethod')
      .mockReturnValue('standalone');

    const updateCommand = await getUpdateCommand();

    expect(updateCommand).toContain('@vercel/vc-native@latest');
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

  describe('native install package manager detection', () => {
    const originalExecPath = process.execPath;

    afterEach(() => {
      Object.defineProperty(process, 'execPath', {
        value: originalExecPath,
        configurable: true,
      });
    });

    function setExecPath(value: string) {
      Object.defineProperty(process, 'execPath', {
        value: value.split('/').join(sep),
        configurable: true,
      });
    }

    it('should suggest pnpm when the binary is installed via pnpm', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      setExecPath(
        '/home/user/.local/share/pnpm/global/5/node_modules/.pnpm/@vercel+vc-native-linux-x64@1.0.0/node_modules/@vercel/vc-native-linux-x64/bin/vercel'
      );

      expect(await getUpdateCommand()).toEqual(
        'pnpm i -g @vercel/vc-native@latest'
      );
    });

    it('should suggest npm with --force otherwise', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      setExecPath(
        '/usr/local/lib/node_modules/@vercel/vc-native/bin/vercel.exe'
      );

      expect(await getUpdateCommand()).toEqual(
        'npm i -g @vercel/vc-native@latest --force'
      );
    });

    it('should suggest yarn when the binary is installed via yarn', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      setExecPath(
        '/home/user/.config/yarn/global/node_modules/@vercel/vc-native/bin/vercel.exe'
      );

      expect(await getUpdateCommand()).toEqual(
        'yarn global add @vercel/vc-native@latest'
      );
    });
  });
});
