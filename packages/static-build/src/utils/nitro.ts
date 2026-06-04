import { createJiti } from 'jiti';
import { existsSync, readFileSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import type { Cron } from '@vercel/build-utils';
import { readConfig } from './build-output-v3';

const NITRO_TASKS_PATH = '/_vercel/tasks/';

// Route file injected before `nitro build` to register a production HTTP
// handler for /_vercel/tasks/:name. Without this, Nitro tree-shakes the task
// runtime entirely — the /_nitro/tasks endpoint is dev-only in Nitro's
// vercel preset.
const TASKS_ROUTE_PATH = ['routes', '_vercel', 'tasks', '[name].ts'];

const TASKS_ROUTE_TEMPLATE = readFileSync(
  path.join(__dirname, '..', 'templates', 'vc_nitro_tasks.ts'),
  'utf8'
);

const NITRO_RUNTIME_PLACEHOLDER = /'__NITRO_RUNTIME__'/;

export async function injectNitroTasksRoute(
  workPath: string,
  runtime: string
): Promise<void> {
  const content = TASKS_ROUTE_TEMPLATE.replace(
    NITRO_RUNTIME_PLACEHOLDER,
    `'${runtime}'`
  );
  const routeFile = path.join(workPath, ...TASKS_ROUTE_PATH);
  await fs.mkdir(path.dirname(routeFile), { recursive: true });
  await fs.writeFile(routeFile, content);
}

export async function cleanupNitroTasksRoute(workPath: string): Promise<void> {
  try {
    const routeFile = path.join(workPath, ...TASKS_ROUTE_PATH);
    await fs.rm(routeFile);
    // Remove empty parent dirs if we created them
    for (let i = TASKS_ROUTE_PATH.length - 1; i > 0; i--) {
      const dir = path.join(workPath, ...TASKS_ROUTE_PATH.slice(0, i));
      await fs.rmdir(dir).catch(() => {});
    }
  } catch {
    // Non-fatal — build output is already written
  }
}

interface NitroConfig {
  scheduledTasks?: Record<string, string | string[]>;
  experimental?: { tasks?: boolean };
}

const NITRO_CONFIG_NAMES = ['nitro.config.ts', 'nitro.config.js'];

async function detectNitroCrons(workPath: string): Promise<Cron[]> {
  // defineNitroConfig / defineConfig are typed identity helpers that Nitro
  // injects as auto-imports. Stub them so jiti can execute nitro.config.ts
  // outside of Nitro's build context.
  (globalThis as any).defineNitroConfig ??= (c: unknown) => c;
  (globalThis as any).defineConfig ??= (c: unknown) => c;

  // Load the nitro config from the work path.
  // We use jiti to execute the config file to imitate how Nitro reads config.
  let config: NitroConfig = {};
  for (const name of NITRO_CONFIG_NAMES) {
    const configPath = path.join(workPath, name);
    if (!existsSync(configPath)) continue;
    const jiti = createJiti(configPath);
    const mod = (await jiti.import(configPath)) as any;
    config = (mod?.default ?? mod) as NitroConfig;
    break;
  }

  const scheduledTasks = config?.scheduledTasks;
  if (!scheduledTasks || Object.keys(scheduledTasks).length === 0) {
    return [];
  }

  if (config.experimental?.tasks !== true) {
    console.warn(
      'Warning: `scheduledTasks` is defined in nitro.config.* but ' +
        '`experimental.tasks` is not enabled. Skipping cron injection. ' +
        'Add `experimental: { tasks: true }` to your nitro.config.* to ' +
        'register scheduled tasks on Vercel.'
    );
    return [];
  }

  const crons: Cron[] = [];
  for (const [schedule, tasks] of Object.entries(scheduledTasks)) {
    const taskNames = Array.isArray(tasks) ? tasks : [tasks];
    for (const taskName of taskNames) {
      crons.push({ path: `${NITRO_TASKS_PATH}${taskName}`, schedule });
    }
  }
  return crons;
}

async function patchConfigJson(
  buildOutputPath: string,
  crons: Cron[]
): Promise<void> {
  const configPath = path.join(buildOutputPath, 'config.json');
  const existing = JSON.parse(await fs.readFile(configPath, 'utf8'));
  existing.crons = crons;
  await fs.writeFile(configPath, JSON.stringify(existing, null, 2));
}

// Newer versions of nitro use the vercel preset and will emit the crons
// by default. Older versions may not use the vercel preset and so we need
// to detect the crons and inject them ourselves.
export async function injectNitroCrons(
  workPath: string,
  outputDirPrefix: string,
  buildOutputPath: string
): Promise<void> {
  const existingConfig = await readConfig(outputDirPrefix);
  if (existingConfig?.crons?.length) return;
  const nitroCrons = await detectNitroCrons(workPath);
  if (nitroCrons.length > 0) {
    await patchConfigJson(buildOutputPath, nitroCrons);
  }
}
