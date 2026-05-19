import {
  type BuildOptions,
  type Cron,
  getInternalServiceCronPath,
  isScheduleTriggeredService,
} from '@vercel/build-utils';

const DYNAMIC_SCHEDULE = '<dynamic>';

export interface BackendsCronEntry extends Cron {
  /**
   * Name of the export on the user's bundled module that the dispatcher
   * should invoke for this entry. `'default'` for static schedules; for
   * `<dynamic>` schedules each entry names a different named export.
   */
  exportName: string;
}

/** Build the JSON route table embedded in the dispatcher shim. */
export function buildCronRouteTable(
  crons: BackendsCronEntry[]
): Record<string, string> {
  const table: Record<string, string> = {};
  for (const cron of crons) {
    table[cron.path] = cron.exportName;
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
export async function getServiceCrons(opts: {
  service?: BuildOptions['service'];
  entrypoint?: string;
}): Promise<BackendsCronEntry[] | undefined> {
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
      exportName: 'default',
    },
  ];
}
