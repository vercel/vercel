import fs from 'fs';
import { join } from 'path';
import execa from 'execa';
import {
  getInternalServiceCronPath,
  NowBuildError,
  type Cron,
} from '@vercel/build-utils';

const DYNAMIC_SCHEDULE = '<dynamic>';

/**
 * Convert a file-path entrypoint to a dotted Python module name.
 * e.g. "jobs/cleanup.py" -> "jobs.cleanup"
 */
function entrypointToModule(entrypoint: string): string {
  return entrypoint
    .replace(/\\/g, '/')
    .replace(/\.py$/i, '')
    .replace(/\//g, '.');
}

const scriptPath = join(__dirname, '..', 'templates', 'vc_cron_detect.py');
const script = fs.readFileSync(scriptPath, 'utf-8');

interface DynamicCronEntry {
  module_function: string;
  schedule: string;
}

interface DynamicCronResult {
  entries?: DynamicCronEntry[];
  error?: string;
}

export interface ServiceCronEntry extends Cron {
  /**
   * The resolved handler for this cron entry. Either "module:function"
   * when a handler function is specified, or just "module" for bare-file
   * cron services (which use the runtime's __main__ fallback).
   */
  resolvedHandler: string;
}

/**
 * Build a JSON route table mapping cron paths to handler specifiers.
 */
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
 * Compute cron entries for a cron service build. Shared between build()
 * and startDevServer() so both paths produce identical cron metadata.
 *
 * For static schedules, returns immediately.
 * For "<dynamic>" schedules, calls a Python function via subprocess.
 */
export async function getServiceCrons(opts: {
  service?: {
    type?: string;
    trigger?: string;
    name?: string;
    schedule?: string;
  };
  entrypoint?: string;
  rawEntrypoint?: string;
  handlerFunction?: string;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<ServiceCronEntry[] | undefined> {
  const { service, entrypoint, rawEntrypoint, handlerFunction } = opts;
  const isScheduledService =
    service?.type === 'cron' ||
    (service?.type === 'job' && service.trigger === 'schedule');

  if (
    !isScheduledService ||
    !service.name ||
    typeof service.schedule !== 'string'
  ) {
    return undefined;
  }

  const cronEntrypoint = entrypoint || rawEntrypoint;
  if (!cronEntrypoint) {
    throw new NowBuildError({
      code: 'PYTHON_CRON_NO_ENTRYPOINT',
      message: 'Cron service is missing an entrypoint.',
    });
  }

  if (service.schedule === DYNAMIC_SCHEDULE) {
    return getServiceCronsDynamic({
      serviceName: service.name,
      cronEntrypoint,
      handlerFunction,
      pythonBin: opts.pythonBin,
      env: opts.env,
      workPath: opts.workPath,
    });
  }

  // Static schedule path
  const cronPath = getInternalServiceCronPath(
    service.name,
    cronEntrypoint,
    handlerFunction || 'cron'
  );
  const moduleName = entrypointToModule(cronEntrypoint);
  const resolvedHandler = handlerFunction
    ? `${moduleName}:${handlerFunction}`
    : moduleName;
  return [{ path: cronPath, schedule: service.schedule, resolvedHandler }];
}

async function getServiceCronsDynamic(opts: {
  serviceName: string;
  cronEntrypoint: string;
  handlerFunction?: string;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<ServiceCronEntry[]> {
  const {
    serviceName,
    cronEntrypoint,
    handlerFunction,
    pythonBin,
    env,
    workPath,
  } = opts;

  if (!handlerFunction) {
    throw new NowBuildError({
      code: 'PYTHON_DYNAMIC_CRON_NO_HANDLER',
      message:
        'Dynamic cron detection requires a "module:object" entrypoint where the object has a get_crons() method.',
    });
  }

  const moduleName = entrypointToModule(cronEntrypoint);

  const entries = await detectDynamicCrons({
    pythonBin,
    env,
    workPath,
    moduleName,
    attrName: handlerFunction,
  });

  console.log(
    `Detected ${entries.length} cron entry(s): ${entries.map(e => `${e.module_function} (${e.schedule})`).join(', ')}`
  );

  if (entries.length === 0) {
    throw new NowBuildError({
      code: 'PYTHON_DYNAMIC_CRON_EMPTY',
      message:
        `Dynamic cron detection returned no entries. ` +
        `"${moduleName}.${handlerFunction}.get_crons()" returned an empty iterable.`,
    });
  }

  return entries.map(entry => {
    const cronPath = moduleColonFuncToCronPath(
      serviceName,
      entry.module_function
    );
    return {
      path: cronPath,
      schedule: entry.schedule,
      resolvedHandler: entry.module_function,
    };
  });
}

/**
 * Call a Python function to dynamically detect cron entries.
 */
async function detectDynamicCrons(opts: {
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
  moduleName: string;
  attrName: string;
}): Promise<DynamicCronEntry[]> {
  const { pythonBin, env, workPath, moduleName, attrName } = opts;

  let stdout: string;
  try {
    const result = await execa(
      pythonBin,
      ['-c', script, moduleName, attrName],
      { env, cwd: workPath }
    );
    stdout = result.stdout;
  } catch (err: any) {
    // The Python script writes structured JSON errors to stdout before
    // exiting non-zero. Prefer that over execa's generic error.
    let detail = err?.stderr || err?.message || String(err);
    try {
      const parsed = JSON.parse(err?.stdout) as DynamicCronResult;
      if (parsed.error) detail = parsed.error;
    } catch {}
    throw new NowBuildError({
      code: 'PYTHON_DYNAMIC_CRON_DETECTION_FAILED',
      message: `Failed to detect dynamic cron entries: ${detail}`,
    });
  }

  let parsed: DynamicCronResult;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new NowBuildError({
      code: 'PYTHON_DYNAMIC_CRON_DETECTION_FAILED',
      message: `Dynamic cron detection returned invalid JSON: ${stdout}`,
    });
  }

  return parsed.entries || [];
}

/**
 * Convert a module:function string into a cron path.
 *
 * Input:  "jobs.cleanup:sync_handler"
 * Output: /_svc/{name}/crons/jobs/cleanup/sync_handler
 */
function moduleColonFuncToCronPath(
  serviceName: string,
  moduleFunction: string
): string {
  const colonIdx = moduleFunction.indexOf(':');
  if (colonIdx === -1) {
    throw new NowBuildError({
      code: 'PYTHON_DYNAMIC_CRON_INVALID_FORMAT',
      message: `Dynamic cron entry must use "module:function" format, got: "${moduleFunction}"`,
    });
  }
  const modulePart = moduleFunction.slice(0, colonIdx);
  const funcPart = moduleFunction.slice(colonIdx + 1);
  // Convert dotted module path to slash-separated path
  const entrypointPath = modulePart.replace(/\./g, '/');
  return getInternalServiceCronPath(serviceName, entrypointPath, funcPart);
}
