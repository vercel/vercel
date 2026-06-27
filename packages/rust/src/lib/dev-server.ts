import { debug } from '@vercel/build-utils';

export function createDevServerEnv(
  baseEnv: Record<string, string | undefined>,
  meta: any = {},
  port?: number
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

  // The `vercel_runtime` crate binds the port from `VERCEL_DEV_PORT`, falling
  // back to a fixed default (3000) when it is unset. Because `vercel dev`
  // restarts the dev server between requests, a fixed port causes
  // "address already in use" when a new instance is spawned before the previous
  // one has fully released the port. Always provide an explicit port (a unique
  // free port is allocated by the caller) so each dev server binds a port that
  // is known to be available.
  if (typeof port === 'number' && Number.isInteger(port)) {
    devEnv.VERCEL_DEV_PORT = String(port);
  }

  // Remove undefined values
  Object.keys(devEnv).forEach(key => {
    if (devEnv[key] === undefined) {
      delete devEnv[key];
    }
  });

  debug(`Dev server environment: ${Object.keys(devEnv).join(', ')}`);
  return devEnv;
}
