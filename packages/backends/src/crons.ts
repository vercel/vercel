import {
  type BuildOptions,
  type Cron,
  getInternalServiceCronPath,
  isScheduleTriggeredService,
} from '@vercel/build-utils';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DYNAMIC_SCHEDULE = '<dynamic>';
const HANDLER_RE = /^[a-zA-Z0-9_-]+$/;

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
 * Static schedules produce a single entry that routes the service's
 * schedule to the user module's default export.
 *
 * For `<dynamic>` schedules, callers must pass `bundle` — a directory on
 * disk containing the bundled handler — so this function can `import()`
 * the entry and call its default export to discover entries. The caller
 * owns the directory's lifecycle (creation and cleanup).
 */
export async function getServiceCrons(opts: {
  service?: BuildOptions['service'];
  entrypoint?: string;
  bundle?: { dir: string; handler: string };
}): Promise<BackendsCronEntry[] | undefined> {
  const { service, entrypoint, bundle } = opts;

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
    if (!bundle) {
      throw new Error(
        'Dynamic cron detection requires the bundled output on disk.'
      );
    }
    return getServiceCronsDynamic({
      serviceName: service.name,
      entrypoint,
      bundle,
    });
  }

  return [
    {
      path: getInternalServiceCronPath(service.name, entrypoint, 'cron'),
      schedule: service.schedule,
      exportName: 'default',
    },
  ];
}

interface DetectedEntry {
  handler: string;
  schedule: string;
}

async function getServiceCronsDynamic(opts: {
  serviceName: string;
  entrypoint: string;
  bundle: { dir: string; handler: string };
}): Promise<BackendsCronEntry[]> {
  const detected = await detectDynamicCrons(opts.bundle);

  if (detected.length === 0) {
    throw new Error(
      'Dynamic cron detection returned no entries; the registry must yield at least one {handler, schedule} entry.'
    );
  }

  return detected.map(entry => ({
    path: getInternalServiceCronPath(
      opts.serviceName,
      opts.entrypoint,
      entry.handler
    ),
    schedule: entry.schedule,
    exportName: entry.handler,
  }));
}

/**
 * Dynamically import the bundled entry, call its default export, and
 * validate the returned entries. Runs in-process: the user module's
 * top-level side effects persist for the rest of the build (same
 * constraint the lambda has at cold-start, so any well-formed cron
 * entrypoint is teardown-clean).
 */
async function detectDynamicCrons(bundle: {
  dir: string;
  handler: string;
}): Promise<DetectedEntry[]> {
  const entryAbs = join(bundle.dir, bundle.handler);
  let userModule: unknown;
  try {
    userModule = await import(pathToFileURL(entryAbs).toString());
  } catch (err) {
    throw new Error(
      `could not import cron entrypoint: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
    );
  }

  const defaultExport = unwrapDefault(userModule);
  if (typeof defaultExport !== 'function') {
    throw new Error(
      'cron entrypoint must default-export a function that returns an array of cron entries'
    );
  }

  let result: unknown;
  try {
    result = await (defaultExport as () => unknown)();
  } catch (err) {
    throw new Error(
      `error calling default export: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
    );
  }

  return validateEntries(result, userModule);
}

function unwrapDefault(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 5; i++) {
    if (
      current &&
      typeof current === 'object' &&
      'default' in (current as object) &&
      (current as { default: unknown }).default
    ) {
      current = (current as { default: unknown }).default;
    } else {
      break;
    }
  }
  return current;
}

function validateEntries(
  result: unknown,
  userModule: unknown
): DetectedEntry[] {
  if (!Array.isArray(result)) {
    throw new Error(
      `default export must return an array, got: ${Object.prototype.toString.call(result)}`
    );
  }

  const entries: DetectedEntry[] = [];
  const seen = new Set<string>();
  for (const item of result) {
    if (item === null || typeof item !== 'object') {
      throw new Error(
        `each cron entry must be an object with {handler, schedule}, got: ${JSON.stringify(item)}`
      );
    }
    const handler = (item as { handler?: unknown }).handler;
    const schedule = (item as { schedule?: unknown }).schedule;
    if (typeof handler !== 'string' || handler === '') {
      throw new Error(
        `cron entry "handler" must be a non-empty string, got: ${JSON.stringify(item)}`
      );
    }
    if (!HANDLER_RE.test(handler)) {
      throw new Error(
        `cron entry handler "${handler}" contains invalid characters; allowed: [a-zA-Z0-9_-]`
      );
    }
    if (seen.has(handler)) {
      throw new Error(`duplicate cron entry handler: "${handler}"`);
    }
    if (typeof schedule !== 'string' || schedule === '') {
      throw new Error(
        `cron entry "schedule" must be a non-empty string, got: ${JSON.stringify(item)}`
      );
    }
    const exported =
      userModule && typeof userModule === 'object'
        ? (userModule as Record<string, unknown>)[handler]
        : undefined;
    if (typeof exported !== 'function') {
      throw new Error(
        `cron entry handler "${handler}" does not match a function export on the cron entrypoint`
      );
    }
    seen.add(handler);
    entries.push({ handler, schedule });
  }
  return entries;
}
