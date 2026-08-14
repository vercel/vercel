export function isNativeBinaryInstall(): boolean {
  return process.env.VERCEL_VC_NATIVE === '1';
}
