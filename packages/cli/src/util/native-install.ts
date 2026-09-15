import { getDataPath } from '@vercel/cli-config';
import { resolve } from 'node:path';

export function isNativeBinaryInstall(): boolean {
  return process.env.VERCEL_VC_NATIVE === '1';
}

/** Install root used by the native curl installer. */
export function getInstallRoot(): string {
  const root = process.env.VERCEL_INSTALL_DIR;
  return root ? resolve(root) : getDataPath();
}
