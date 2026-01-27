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
 * Detect services in a project if experimental services are enabled.
 *
 * Returns the services detection result if:
 * - VERCEL_USE_EXPERIMENTAL_SERVICES=1 env var is set
 * - vercel.json contains experimentalServices
 *
 * Returns null otherwise.
 */
export async function detectProjectServices(
  cwd: string
): Promise<DetectServicesResult | null> {
  if (!isExperimentalServicesEnabled()) {
    return null;
  }

  const fs = new LocalFileSystemDetector(cwd);
  const result = await detectServices({ fs });

  // If no services configured (error NO_SERVICES_CONFIGURED), return null
  // This means vercel.json doesn't have experimentalServices
  const hasNoServicesError = result.errors.some(
    e => e.code === 'NO_SERVICES_CONFIGURED'
  );

  if (hasNoServicesError) {
    return null;
  }

  return result;
}
