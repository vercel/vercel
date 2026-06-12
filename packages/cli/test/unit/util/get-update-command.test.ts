import { afterEach, describe, expect, it } from 'vitest';
import { sep } from 'path';
import getUpdateCommand, {
  isGlobal,
} from '../../../src/util/get-update-command';

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

    const updateCommand = await getUpdateCommand();

    expect(updateCommand).toContain('@vercel/vc-native@latest');
    expect(updateCommand.split(' ')).not.toContain('vercel@latest');
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
