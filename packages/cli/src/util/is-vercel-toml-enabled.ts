/**
 * Check if vercel.toml config file support is enabled.
 * This is a feature flag to safely roll out TOML config support.
 */
export function isVercelTomlEnabled(): boolean {
  return process.env.VERCEL_TOML_CONFIG_ENABLED === '1';
}
