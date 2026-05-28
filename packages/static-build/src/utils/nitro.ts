import { createJiti } from 'jiti';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import type { Cron } from '@vercel/build-utils';

interface NitroConfig {
  scheduledTasks?: Record<string, string | string[]>;
  experimental?: { tasks?: boolean };
}

const NITRO_CONFIG_NAMES = ['nitro.config.ts', 'nitro.config.js'];

export async function detectNitroCrons(workPath: string): Promise<Cron[]> {
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
      crons.push({ path: `/_nitro/tasks/${taskName}`, schedule });
    }
  }
  return crons;
}

export async function patchConfigJson(
  buildOutputPath: string,
  crons: Cron[]
): Promise<void> {
  const configPath = path.join(buildOutputPath, 'config.json');
  const existing = JSON.parse(await fs.readFile(configPath, 'utf8'));
  existing.crons = crons;
  await fs.writeFile(configPath, JSON.stringify(existing, null, 2));
}
