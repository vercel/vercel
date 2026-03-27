import { writeFile } from 'fs/promises';
import { basename, join } from 'path';
import {
  detectServices,
  LocalFileSystemDetector,
  type ResolvedServicesResult,
  type InferredServicesResult,
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
  /** Services resolved for use by dev/build (from config or auto-detection). */
  resolved: ResolvedServicesResult;
  /** Inferred services from layout that could be written to config, or null. */
  inferred: InferredServicesResult | null;
  /** Whether the user has explicitly opted in (vercel.json config or env var). */
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
 * Minimum number of inferred services required to classify a project as
 * services-shaped. Matches the threshold used by the API repo so a solo
 * root framework (e.g. a plain Next.js app) doesn't get misclassified.
 */
const MIN_INFERRED_SERVICES = 2;

/**
 * Detect services in the project directory.
 *
 * Uses the structured `resolved` / `inferred` fields from
 * `@vercel/fs-detectors` rather than the deprecated top-level fields.
 *
 * Returns a `TryDetectServicesResult` when services are found:
 * - `enabled: true` when the user has explicitly opted in (config or env var)
 * - `enabled: false` when services were auto-detected from the project
 *   layout but the user has not opted in (informational only)
 *
 * Returns `null` when no services are detected.
 */
export async function tryDetectServices(
  cwd: string
): Promise<TryDetectServicesResult | null> {
  const fs = new LocalFileSystemDetector(cwd);
  const result = await detectServices({ fs });
  const { resolved, inferred } = result;

  // Explicitly configured services in vercel.json
  const hasConfiguredServices =
    resolved.source === 'configured' &&
    resolved.services.length > 0 &&
    resolved.errors.length === 0;

  if (hasConfiguredServices) {
    return { resolved, inferred, enabled: true };
  }

  // Configured but with validation errors — still surface them so the
  // user sees what went wrong in their vercel.json.
  if (resolved.source === 'configured' && resolved.errors.length > 0) {
    return { resolved, inferred, enabled: true };
  }

  // Auto-detection via env var: treat as explicitly enabled when the env
  // var is set and enough services were inferred from the project layout.
  const envVarEnabled =
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES === '1' ||
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES?.toLowerCase() === 'true';

  if (
    envVarEnabled &&
    inferred !== null &&
    inferred.services.length >= MIN_INFERRED_SERVICES
  ) {
    return { resolved, inferred, enabled: true };
  }

  // Inferred services found by filesystem layout but user hasn't opted in.
  // Return for informational purposes (the caller can show a hint).
  if (inferred !== null && inferred.services.length >= MIN_INFERRED_SERVICES) {
    return { resolved, inferred, enabled: false };
  }

  // Nothing meaningful detected.
  return null;
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
