import { debug } from '@vercel/build-utils';

export function createDevServerEnv(
  baseEnv: Record<string, string | undefined>,
  meta: any = {}
): Record<string, string> {
  const devEnv: Record<string, string> = {
    // Base environment
    ...(Object.fromEntries(
      Object.entries(baseEnv).filter(([, value]) => value !== undefined)
    ) as Record<string, string>),

    // Development-specific variables
    VERCEL_DEV: '1',
    RUST_LOG: process.env.RUST_LOG || 'info',

    // Runtime environment from meta
    ...(meta.env || {}),
  };

  // Remove undefined values
  Object.keys(devEnv).forEach(key => {
    if (devEnv[key] === undefined) {
      delete devEnv[key];
    }
  });

  debug(`Dev server environment: ${Object.keys(devEnv).join(', ')}`);
  return devEnv;
}
