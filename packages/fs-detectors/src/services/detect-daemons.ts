import { getDaemonNames } from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type { DetectedDaemon } from './types';
import { readVercelConfig, type ReadVercelConfigResult } from './utils';

/**
 * Read the daemons in `vercel.json#daemons` (or `vercel.toml`) from `fs`.
 *
 * This reads the same files as `detectServices` does when it isn't given
 * `configuredServices`. A caller that passes services from an already loaded
 * config (e.g. a compiled `vercel.ts`) should read that config's `daemons`
 * instead, so services and daemons come from the same config.
 *
 * Safe on unvalidated config: a `daemons` that isn't an object yields no
 * daemons, an `entrypoint` that isn't a string is left out, and an unreadable
 * config yields no daemons (`detectServices` reports the parse error).
 */
export async function detectDaemons({
  fs,
  workPath,
}: {
  fs: DetectorFilesystem;
  /** Working directory path (relative to fs root) to read the config from. */
  workPath?: string;
}): Promise<DetectedDaemon[]> {
  const { config } = await readVercelConfig(workPath ? fs.chdir(workPath) : fs);
  return getDetectedDaemons(config);
}

function getDetectedDaemons(
  config: ReadVercelConfigResult['config']
): DetectedDaemon[] {
  const daemons = config?.daemons as Record<string, unknown> | undefined;
  return getDaemonNames(config).map(name => {
    const daemon = daemons?.[name];
    const entrypoint =
      typeof daemon === 'object' && daemon !== null
        ? (daemon as { entrypoint?: unknown }).entrypoint
        : undefined;
    return typeof entrypoint === 'string' ? { name, entrypoint } : { name };
  });
}
