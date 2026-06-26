import { realpathSync } from 'fs';
import { sep } from 'path';
import output from '../output-manager';

export function isNativeBinaryInstall(): boolean {
  return process.env.VERCEL_VC_NATIVE === '1';
}

export type NativeInstallMethod = 'npm' | 'standalone';

export function getNativeInstallMethod(): NativeInstallMethod {
  try {
    const real = realpathSync(process.execPath);
    if (real.includes(`node_modules${sep}@vercel${sep}vc-native`)) {
      return 'npm';
    }
    return 'standalone';
  } catch (err) {
    output.debug(
      `Could not resolve native install method, assuming npm: ${err}`
    );
    return 'npm';
  }
}

export function shouldUseStandaloneUpgrade(): boolean {
  return (
    isNativeBinaryInstall() &&
    process.platform !== 'win32' &&
    getNativeInstallMethod() === 'standalone'
  );
}

export function getReleaseTarget(): string | undefined {
  let os: string | undefined;
  if (process.platform === 'darwin') {
    os = 'darwin';
  } else if (process.platform === 'linux') {
    os = 'linux';
  }

  let arch: string | undefined;
  if (process.arch === 'arm64') {
    arch = 'arm64';
  } else if (process.arch === 'x64') {
    arch = 'x64';
  }

  if (!os || !arch) {
    return undefined;
  }
  return `vercel-${os}-${arch}`;
}
