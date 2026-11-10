import { getDataPath } from '@vercel/cli-config';
import { resolve } from 'node:path';

export function isNativeBinaryInstall(): boolean {
  return process.env.VERCEL_VC_NATIVE === '1';
}

/**
 * Whether Builders load from the pinned vlt graphs instead of the CLI's own
 * dependencies. The native binary always does; a JS install whose files were
 * ejected from the binary opts in with `VERCEL_CLI_MANAGED_BUILDERS=1`.
 */
export function isManagedBuildersInstall(): boolean {
  return (
    isNativeBinaryInstall() || process.env.VERCEL_CLI_MANAGED_BUILDERS === '1'
  );
}

/** Install root used by the native curl installer. */
export function getInstallRoot(): string {
  const root = process.env.VERCEL_INSTALL_DIR;
  return root ? resolve(root) : getDataPath();
}
