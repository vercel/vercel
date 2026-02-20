import {
  detectServices,
  LocalFileSystemDetector,
  type DetectServicesResult,
} from '@vercel/fs-detectors';

export function isExperimentalServicesEnabled(): boolean {
  return (
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES === '1' ||
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES?.toLowerCase() === 'true'
  );
}

/**
 * Detect services if experimental services are enabled.
 *
 * Returns the detection result if:
 * - VERCEL_USE_EXPERIMENTAL_SERVICES=1 env var is set
 * - vercel.json contains experimentalServices with valid services
 *
 * Returns null otherwise.
 */
export async function tryDetectServices(
  cwd: string
): Promise<DetectServicesResult | null> {
  if (!isExperimentalServicesEnabled()) {
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
