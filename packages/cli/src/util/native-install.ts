import { realpathSync } from 'fs';
import { sep } from 'path';

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
  } catch {
    return 'npm';
  }
}
