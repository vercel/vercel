import type { GetDevWarnings } from '@vercel/build-utils';
import { getConfig } from '@vercel/static-config';
import { join } from 'path';
import {
  edgeMiddlewareDeprecationWarning,
  resolveMiddlewareRuntime,
  validateMiddlewareRuntime,
} from './utils';

export const getDevWarnings: GetDevWarnings = async ({
  entrypoint,
  workPath,
  config,
  meta = {},
}) => {
  if (config.middleware !== true) return [];

  const staticConfig = getConfig(null, join(workPath, entrypoint));
  validateMiddlewareRuntime(
    staticConfig?.runtime,
    entrypoint,
    config.middlewareRuntime
  );

  const { runtime } = resolveMiddlewareRuntime({
    configuredRuntime: staticConfig?.runtime,
    middlewareRuntime: config.middlewareRuntime,
    projectCreatedAt: config.projectSettings?.createdAt,
    isDev: true,
    env: { ...process.env, ...meta.env, ...meta.buildEnv },
  });

  return runtime === 'edge'
    ? [edgeMiddlewareDeprecationWarning(entrypoint)]
    : [];
};
