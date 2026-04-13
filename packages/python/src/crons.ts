import { getInternalServiceCronPath, type Cron } from '@vercel/build-utils';

/**
 * Compute cron entries for a cron service build. Shared between build()
 * and startDevServer() so both paths produce identical cron metadata.
 */
export function getServiceCrons(opts: {
  service?: { type?: string; name?: string; schedule?: string };
  entrypoint?: string;
  rawEntrypoint?: string;
  handlerFunction?: string;
}): Cron[] | undefined {
  const { service, entrypoint, rawEntrypoint, handlerFunction } = opts;
  if (
    service?.type !== 'cron' ||
    !service.name ||
    typeof service.schedule !== 'string'
  ) {
    return undefined;
  }
  const cronEntrypoint = entrypoint || rawEntrypoint || 'index';
  const cronPath = getInternalServiceCronPath(
    service.name,
    cronEntrypoint,
    handlerFunction || 'cron'
  );
  return [{ path: cronPath, schedule: service.schedule }];
}
