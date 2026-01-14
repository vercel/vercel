import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServiceDetectionError,
  ExperimentalServices,
} from './types';
import { validateServiceConfig, resolveService } from './resolve';

export * from './types';
export * from './resolve';
export * from './utils';
export { getServicesBuilders } from './builders';

/**
 * Detect and resolve services within a project.
 *
 * Reads service configurations from vercel.json `experimentalServices`
 * and resolves them into ResolvedService objects.
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath = '' } = options;
  const services: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];

  // Use explicit services if provided, otherwise read from vercel.json
  let experimentalServices: ExperimentalServices | undefined =
    options.explicitServices;

  if (!experimentalServices) {
    // Read vercel.json
    const configPath = workPath ? `${workPath}/vercel.json` : 'vercel.json';

    try {
      const configBuffer = await fs.readFile(configPath);
      const config = JSON.parse(configBuffer.toString('utf-8'));
      experimentalServices = config.experimentalServices;
    } catch {
      // No vercel.json or invalid JSON - return empty result
      return { services, errors };
    }
  }

  if (experimentalServices && typeof experimentalServices === 'object') {
    for (const name of Object.keys(experimentalServices)) {
      const serviceConfig = experimentalServices[name];

      const validationError = validateServiceConfig(name, serviceConfig);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      const resolved = resolveService(name, serviceConfig);
      services.push(resolved);
    }
  }

  return { services, errors };
}
