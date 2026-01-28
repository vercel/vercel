import { detectServices, LocalFileSystemDetector } from '@vercel/fs-detectors';
import {
  displayDetectedServices,
  displayServiceErrors,
  displayServicesConfigNote,
} from '../input/display-services';

export function isExperimentalServicesEnabled(): boolean {
  return (
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES === '1' ||
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES?.toLowerCase() === 'true'
  );
}

/**
 * Detect and display services if experimental services are enabled.
 *
 * Returns 'services' framework string if:
 * - VERCEL_USE_EXPERIMENTAL_SERVICES=1 env var is set
 * - vercel.json contains experimentalServices with valid services
 *
 * Returns null otherwise.
 */
export async function tryDetectServices(cwd: string): Promise<string | null> {
  if (!isExperimentalServicesEnabled()) {
    return null;
  }

  const fs = new LocalFileSystemDetector(cwd);
  const result = await detectServices({ fs });

  // No services configured - return null silently
  const hasNoServicesError = result.errors.some(
    e => e.code === 'NO_SERVICES_CONFIGURED'
  );
  if (hasNoServicesError || result.services.length === 0) {
    return null;
  }

  // Display detected services
  displayDetectedServices(result.services);
  if (result.errors.length > 0) {
    displayServiceErrors(result.errors);
  }
  displayServicesConfigNote();

  return 'services';
}
