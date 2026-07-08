import { afterEach, describe, expect, it } from 'vitest';
import { sep } from 'path';
import getUpdateCommand, {
  isGlobal,
} from '../../../src/util/get-update-command';

describe('getUpdateCommand', () => {
  const originalVercelVcNative = process.env.VERCEL_VC_NATIVE;
  const originalPnpmHome = process.env.PNPM_HOME;

  afterEach(() => {
    if (originalVercelVcNative === undefined) {
      delete process.env.VERCEL_VC_NATIVE;
    } else {
      process.env.VERCEL_VC_NATIVE = originalVercelVcNative;
    }
    if (originalPnpmHome === undefined) {
      delete process.env.PNPM_HOME;
    } else {
      process.env.PNPM_HOME = originalPnpmHome;
    }
  });

  it('should detect update command', async () => {
    delete process.env.VERCEL_VC_NATIVE;
    delete process.env.PNPM_HOME;

    const updateCommand = await getUpdateCommand();
    if (await isGlobal()) {
      expect(updateCommand).toEqual(
        `pnpm i -g vercel@latest --allow-build=esbuild`
      );
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

  describe('pnpm global installs (PNPM_HOME)', () => {
    const originalArgv1 = process.argv[1];

    afterEach(() => {
      process.argv[1] = originalArgv1;
    });

    function setEntrypoint(value: string) {
      process.argv[1] = value.split('/').join(sep);
    }

    function pnpmHome(value: string) {
      process.env.PNPM_HOME = value.split('/').join(sep);
    }

    it('detects pnpm 11 isolated global installs via PNPM_HOME', async () => {
      delete process.env.VERCEL_VC_NATIVE;
      pnpmHome('/home/user/.local/share/pnpm');
      // pnpm 11 bin shims exec a target inside PNPM_HOME/global/v11/{hash}/
      setEntrypoint(
        '/home/user/.local/share/pnpm/global/v11/150b-19f23dfe656/node_modules/vercel/dist/vc.js'
      );

      expect(await getUpdateCommand()).toEqual(
        'pnpm i -g vercel@latest --allow-build=esbuild'
      );
      expect(await isGlobal()).toBe(true);
    });

    it('detects legacy pnpm global installs via PNPM_HOME', async () => {
      delete process.env.VERCEL_VC_NATIVE;
      pnpmHome('/home/user/.local/share/pnpm');
      setEntrypoint(
        '/home/user/.local/share/pnpm/global/5/node_modules/vercel/dist/vc.js'
      );

      expect(await getUpdateCommand()).toEqual(
        'pnpm i -g vercel@latest --allow-build=esbuild'
      );
    });

    it('matches PNPM_HOME as a path prefix, not a substring', async () => {
      delete process.env.VERCEL_VC_NATIVE;
      pnpmHome('/home/user/.local/share/pnpm');
      // Sibling directory that shares the PNPM_HOME string prefix must not match
      setEntrypoint(
        '/home/user/.local/share/pnpm-backup/node_modules/vercel/dist/vc.js'
      );

      // Falls through to the regular detection (repo-dependent), but must not
      // have taken the PNPM_HOME fast path with this entrypoint. The fast path
      // always yields global pnpm; the repo fallback yields a local install.
      const updateCommand = await getUpdateCommand();
      const viaFastPath =
        updateCommand === 'pnpm i -g vercel@latest --allow-build=esbuild' &&
        (await isGlobal());
      // In the dev repo the fallback resolves a local pnpm install, so the
      // fast path result (global) would only appear if prefix matching leaked.
      expect(viaFastPath).toBe(false);
    });
  });

  describe('unrecognized layouts', () => {
    const originalArgv1 = process.argv[1];

    afterEach(() => {
      process.argv[1] = originalArgv1;
    });

    it('degrades to a global npm upgrade instead of guessing local', async () => {
      delete process.env.VERCEL_VC_NATIVE;
      delete process.env.PNPM_HOME;
      // Entrypoint that cannot be resolved on disk (e.g. a virtual filesystem
      // snapshot path) and matches no global layout heuristics.
      process.argv[1] = ['', 'nonexistent', 'snapshot', 'dist', 'vc.js'].join(
        sep
      );

      // Must never produce a local install command, which would run in (and
      // mutate) the user's current working directory.
      expect(await getUpdateCommand()).toEqual('npm i -g vercel@latest');
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
        'pnpm i -g @vercel/vc-native@latest --allow-build=@vercel/vc-native'
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
