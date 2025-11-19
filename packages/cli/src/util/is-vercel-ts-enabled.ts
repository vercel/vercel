/**
 * Check if vercel.ts config file support is enabled.
 * This is a feature flag to safely roll out TypeScript config support.
 */
export function isVercelTsEnabled(): boolean {
  return process.env.VERCEL_TS_CONFIG_ENABLED === '1';
}
