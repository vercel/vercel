import {
  type BuildOptions,
  type Cron,
  getInternalServiceCronPath,
  isScheduleTriggeredService,
} from '@vercel/build-utils';

const DYNAMIC_SCHEDULE = '<dynamic>';

/** Function name to invoke on the imported user module. */
const DEFAULT_HANDLER_NAME = 'default';

export interface ServiceCronEntry extends Cron {
  /**
   * The function to invoke on the user's module. For v1 this is always
   * `'default'`; multi-handler / `<dynamic>` support will populate this
   * from the user's registry.
   */
  resolvedHandler: string;
}

/** Build the JSON route table embedded in `__VC_CRON_ROUTES`. */
export function buildCronRouteTable(
  crons: ServiceCronEntry[]
): Record<string, string> {
  const table: Record<string, string> = {};
  for (const cron of crons) {
    table[cron.path] = cron.resolvedHandler;
  }
  return table;
}

/**
 * Compute cron entries for a JS/TS cron service build.
 *
 * Mirrors `packages/python/src/crons.ts` for static schedules. Returns
 * `undefined` when the service is not schedule-triggered. Throws on
 * `<dynamic>` schedules — that path is reserved for a follow-up.
 */
export function getServiceCrons(opts: {
  service?: BuildOptions['service'];
  entrypoint?: string;
}): ServiceCronEntry[] | undefined {
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
    // Dynamic schedules aren't yet supported for JS/TS services. Return
    // undefined so the CLI's downstream check (build/index.ts:1235-1260)
    // fires its existing CRON_SERVICE_NO_CRONS error, preserving the
    // legacy message and regression coverage.
    return undefined;
  }

  const cronPath = getInternalServiceCronPath(service.name, entrypoint, 'cron');
  return [
    {
      path: cronPath,
      schedule: service.schedule,
      resolvedHandler: DEFAULT_HANDLER_NAME,
    },
  ];
}
