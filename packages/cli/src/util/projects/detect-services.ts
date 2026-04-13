import { writeFile } from 'fs/promises';
import { basename, join } from 'path';
import {
  detectServices,
  LocalFileSystemDetector,
  type DetectServicesResult,
  type ServicesConfig,
} from '@vercel/fs-detectors';
import type { VercelConfig } from '../dev/types';
import { compileVercelConfig } from '../compile-vercel-config';
import { CantParseJSONFile } from '../errors-ts';
import readJSONFile from '../read-json-file';
import { validateConfig } from '../validate-config';
import { isVercelTomlEnabled } from '../is-vercel-toml-enabled';

export type ServicesConfigWriteBlocker = 'builds' | 'functions';

/**
 * Check if vercel.json in the given directory has experimentalServices configured
 * or VERCEL_USE_EXPERIMENTAL_SERVICES environment variable is set.
 */
export async function isExperimentalServicesEnabled(
  cwd: string
): Promise<boolean> {
  return (
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES === '1' ||
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES?.toLowerCase() === 'true' ||
    (await hasExperimentalServicesConfig(cwd))
  );
}

async function hasExperimentalServicesConfig(cwd: string): Promise<boolean> {
  try {
    const compileResult = await compileVercelConfig(cwd);
    if (!compileResult.configPath) return false;

    const config = await readJSONFile<Record<string, unknown>>(
      compileResult.configPath
    );
    if (!config || config instanceof Error) return false;
    return (
      config.experimentalServices != null &&
      typeof config.experimentalServices === 'object'
    );
  } catch {
    return false;
  }
}

/**
 * Detect services if experimental services are enabled.
 *
 * Returns the detection result if any of the following is true:
 * - vercel.json contains experimentalServices with valid services
 * - VERCEL_USE_EXPERIMENTAL_SERVICES env var is set (enables auto-detection of services)
 *
 * Returns null otherwise.
 */
export async function tryDetectServices(
  cwd: string
): Promise<DetectServicesResult | null> {
  const isServicesEnabled = await isExperimentalServicesEnabled(cwd);
  if (!isServicesEnabled) {
    return null;
  }

  const fs = new LocalFileSystemDetector(cwd);
  const result = await detectServices({ fs });

  // No services configured
  const hasNoServicesError = result.errors.some(
    e => e.code === 'NO_SERVICES_CONFIGURED'
  );
  if (hasNoServicesError) {
    return null;
  }

  return result;
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

  if (
    isVercelTomlEnabled() &&
    compileResult.configPath &&
    basename(compileResult.configPath) === 'vercel.toml'
  ) {
    throw new Error('Cannot automatically update vercel.toml.');
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
