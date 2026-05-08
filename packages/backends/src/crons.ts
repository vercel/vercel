import {
  type BuildOptions,
  type Cron,
  getInternalServiceCronPath,
  isScheduleTriggeredService,
} from '@vercel/build-utils';

const DYNAMIC_SCHEDULE = '<dynamic>';

/** Build the JSON route table embedded in `__VC_CRON_ROUTES`. */
export function buildCronRouteTable(crons: Cron[]): Record<string, string> {
  const table: Record<string, string> = {};
  for (const cron of crons) {
    table[cron.path] = 'default';
  }
  return table;
}

/**
 * Compute cron entries for a JS/TS cron service build.
 *
 * Mirrors `packages/python/src/crons.ts` for static schedules. Returns
 * `undefined` when the service is not schedule-triggered. Throws on
 * `<dynamic>` schedules — that path is reserved for a follow-up.
 *
 * v1 always invokes the user module's default export, so this returns
 * plain `Cron[]` (no handler-name field). When `handlerFunction` or
 * `<dynamic>` support lands, this will need to grow a per-path handler
 * name back.
 */
export function getServiceCrons(opts: {
  service?: BuildOptions['service'];
  entrypoint?: string;
}): Cron[] | undefined {
  const { service, entrypoint } = opts;

  if (!service || !isScheduleTriggeredService(service)) {
    return undefined;
  }
  if (!service.name || typeof service.schedule !== 'string') {
    return undefined;
  }

  if (!entrypoint) {
    throw new Error('Cron service is missing an entrypoint');
  }

  if (service.schedule === DYNAMIC_SCHEDULE) {
    throw new Error(
      'Dynamic cron schedules ("<dynamic>") are not yet supported for JavaScript/TypeScript services. Use a static cron expression in vercel.json.'
    );
  }

  return [
    {
      path: getInternalServiceCronPath(service.name, entrypoint, 'cron'),
      schedule: service.schedule,
    },
  ];
}
