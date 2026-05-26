import { existsSync } from 'fs';
import { join } from 'path';
import type { VercelTargetEnvironment } from '@vercel/build-utils';
import output from '../../output-manager';
import { VERCEL_DIR } from '../projects/link';
import { createEnvObject } from './diff-env-files';

export function getLocalVercelEnvFilePath(
  cwd: string,
  target: VercelTargetEnvironment,
  rootDirectory?: string | null
): string {
  const projectRoot =
    rootDirectory && rootDirectory !== '.' ? rootDirectory : '';

  return join(cwd, projectRoot, VERCEL_DIR, `.env.${target}.local`);
}

export async function loadLocalVercelEnvFile(
  cwd: string,
  target: VercelTargetEnvironment,
  rootDirectory?: string | null
): Promise<Record<string, string | undefined>> {
  const envPath = getLocalVercelEnvFilePath(cwd, target, rootDirectory);

  if (!existsSync(envPath)) {
    output.debug(`Local env file not found at "${envPath}"`);
    return {};
  }

  const env = await createEnvObject(envPath);
  if (env) {
    output.debug(`Loaded environment variables from "${envPath}"`);
  }

  return env ?? {};
}
