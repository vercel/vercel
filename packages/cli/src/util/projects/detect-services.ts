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

export type ServicesConfigWriteBlocker = 'builds' | 'functions';

/**
 * Result of `tryDetectServices()`.
 *
 * - `enabled`: `true` when the user has explicitly opted in to multi-service
 *   mode (via `experimentalServices` in vercel.json or the
 *   `VERCEL_USE_EXPERIMENTAL_SERVICES` env var). When `true`, the caller
 *   should activate multi-service dev (orchestrator, lock, etc.).
 * - `enabled`: `false` when services were auto-detected from the project
 *   layout but the user has not opted in. The caller can display an
 *   informational message but should not change dev-server behavior.
 */
export interface TryDetectServicesResult {
  result: DetectServicesResult;
  enabled: boolean;
}

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
 * Detect services in the project directory.
 *
 * Always runs filesystem auto-detection regardless of configuration.
 *
 * Returns a `TryDetectServicesResult` when services are found:
 * - `enabled: true` when the user has explicitly opted in (config or env var)
 * - `enabled: false` when services were auto-detected but the user has not
 *   opted in (informational only)
 *
 * Returns `null` when no services are detected.
 */
export async function tryDetectServices(
  cwd: string
): Promise<TryDetectServicesResult | null> {
  const enabled = await isExperimentalServicesEnabled(cwd);

  const fs = new LocalFileSystemDetector(cwd);
  const result = await detectServices({ fs });

  // No services found at all (not configured, not auto-detected)
  const hasNoServicesError = result.errors.some(
    e => e.code === 'NO_SERVICES_CONFIGURED'
  );
  if (hasNoServicesError) {
    return null;
  }

  // When explicitly enabled, always return the result (even with 0 services
  // but errors, so validation errors can be surfaced to the user).
  if (enabled) {
    return { result, enabled };
  }

  // When not explicitly enabled, only return if auto-detection found services
  if (result.services.length === 0) {
    return null;
  }

  return { result, enabled };
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
