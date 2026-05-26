export const BUILD_PROCESS_HANG_CHECK_ENV = 'VERCEL_BUILD_PROCESS_HANG_CHECK';

export function isBuildProcessHangCheckEnabled(): boolean {
  const value = process.env[BUILD_PROCESS_HANG_CHECK_ENV];
  return value === '1' || value?.toLowerCase() === 'true';
}
