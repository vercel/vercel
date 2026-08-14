import fs from 'fs';
import { join } from 'path';
import { debug } from '@vercel/build-utils';
import { getVenvSitePackagesDirs } from '../install';
import type { Quirk, QuirkContext, QuirkResult } from './index';

const LAMBDA_ROOT = '/var/task';

const CONFIG_CANDIDATES = [
  'litellm_config.yaml',
  'litellm_config.yml',
  'litellm.yaml',
  'litellm.yml',
];

/** Find a litellm config file in workPath. Returns the basename if found. */
async function findConfigFile(workPath: string): Promise<string | null> {
  for (const name of CONFIG_CANDIDATES) {
    const candidate = join(workPath, name);
    try {
      await fs.promises.access(candidate);
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

export const litellmQuirk: Quirk = {
  dependency: 'litellm',
  runsBefore: ['prisma'],
  async run(ctx: QuirkContext): Promise<QuirkResult> {
    const buildEnv: Record<string, string> = {};
    const env: Record<string, string> = {};

    // 1. Find Prisma schema bundled with litellm
    const sitePackagesDirs = await getVenvSitePackagesDirs(ctx.venvPath);
    for (const sitePackages of sitePackagesDirs) {
      const schemaPath = join(
        sitePackages,
        'litellm',
        'proxy',
        'schema.prisma'
      );
      try {
        await fs.promises.access(schemaPath);
        debug(`LiteLLM quirk: found schema at ${schemaPath}`);
        buildEnv.PRISMA_SCHEMA_PATH = schemaPath;
        break;
      } catch {
        // try next site-packages directory
      }
    }

    if (!buildEnv.PRISMA_SCHEMA_PATH) {
      debug('LiteLLM quirk: schema.prisma not found in any site-packages');
    }

    // 2. Set CONFIG_FILE_PATH if not already set
    if (!process.env.CONFIG_FILE_PATH) {
      const configName = await findConfigFile(ctx.workPath);
      if (configName) {
        debug(`LiteLLM quirk: found config at ${configName}`);
        buildEnv.CONFIG_FILE_PATH = join(ctx.workPath, configName);
        env.CONFIG_FILE_PATH = join(LAMBDA_ROOT, configName);
      }
    } else {
      debug(
        `LiteLLM quirk: CONFIG_FILE_PATH already set to ${process.env.CONFIG_FILE_PATH}`
      );
    }

    return { buildEnv, env };
  },
};
