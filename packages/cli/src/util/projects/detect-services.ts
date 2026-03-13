import { join } from 'path';
import {
  detectServices,
  LocalFileSystemDetector,
  type DetectServicesResult,
} from '@vercel/fs-detectors';
import readJSONFile from '../read-json-file';

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
