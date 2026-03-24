import { writeFile } from 'fs/promises';
import { basename, join } from 'path';
import {
  getServicesBuilders,
  type Service,
  type ServicesConfig,
} from '@vercel/fs-detectors';
import type { VercelConfig } from '../dev/types';
import { compileVercelConfig } from '../compile-vercel-config';
import { CantParseJSONFile } from '../errors-ts';
import readJSONFile from '../read-json-file';
import { validateConfig } from '../validate-config';

export type ServicesConfigWriteBlocker = 'builds' | 'functions';

/**
 * Check if the given directory explicitly configures services.
 */
export async function hasExperimentalServicesConfig(
  cwd: string
): Promise<boolean> {
  const config = await readJSONFile<Record<string, unknown>>(
    join(cwd, 'vercel.json')
  );
  if (!config || config instanceof Error) return false;
  return (
    config.experimentalServices != null &&
    typeof config.experimentalServices === 'object'
  );
}

/**
 * Detect services that are buildable/runnable for the given directory.
 */
export async function tryDetectServices(
  cwd: string
): Promise<Service[] | null> {
  const result = await getServicesBuilders({ workPath: cwd });
  return result.services ?? null;
}

export async function writeServicesConfig(
  cwd: string,
  config: ServicesConfig
): Promise<void> {
  const prepared = await prepareServicesConfigWrite(cwd, config);
  await writeFile(
    prepared.configPath,
    JSON.stringify(prepared.config, null, 2) + '\n',
    'utf8'
  );
}

export async function getServicesConfigWriteBlocker(
  cwd: string,
  config: ServicesConfig
): Promise<ServicesConfigWriteBlocker | null> {
  try {
    await prepareServicesConfigWrite(cwd, config);
    return null;
  } catch (error) {
    return getServicesConfigWriteBlockerFromError(error);
  }
}

function toProjectServicesConfigPatch(
  config: ServicesConfig
): Pick<VercelConfig, 'experimentalServices'> {
  return {
    experimentalServices: config,
  };
}

async function prepareServicesConfigWrite(
  cwd: string,
  config: ServicesConfig
): Promise<{
  configPath: string;
  config: VercelConfig;
}> {
  const compileResult = await compileVercelConfig(cwd);
  const configPath = join(cwd, 'vercel.json');

  if (compileResult.wasCompiled) {
    throw new Error(
      `Cannot automatically update ${compileResult.sourceFile ?? 'the current Vercel config'}.`
    );
  }

  if (
    compileResult.configPath &&
    basename(compileResult.configPath) === 'now.json'
  ) {
    throw new Error('Cannot automatically update now.json.');
  }

  let existingConfig: VercelConfig = {};
  if (
    compileResult.configPath &&
    basename(compileResult.configPath) === 'vercel.json'
  ) {
    const result = await readJSONFile<VercelConfig>(configPath);
    if (result instanceof CantParseJSONFile) {
      throw result;
    }
    existingConfig = result ?? {};
  }

  const nextConfig: VercelConfig = {
    ...existingConfig,
    ...toProjectServicesConfigPatch(config),
  };
  const validationError = validateConfig(nextConfig);
  if (validationError) {
    throw validationError;
  }

  return {
    configPath,
    config: nextConfig,
  };
}

function getServicesConfigWriteBlockerFromError(
  error: unknown
): ServicesConfigWriteBlocker | null {
  switch ((error as { code?: string })?.code) {
    case 'SERVICES_AND_BUILDS':
      return 'builds';
    case 'SERVICES_AND_FUNCTIONS':
      return 'functions';
    default:
      return null;
  }
}
