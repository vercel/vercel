import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServiceDetectionError,
  ExperimentalServices,
  ExperimentalServiceGroups,
  ServiceRuntime,
} from './types';
import { RUNTIME_BUILDERS } from './types';
import { validateServiceConfig, resolveService } from './resolve';

export * from './types';
export * from './resolve';

/**
 * Detect and resolve services within a project.
 *
 * Reads service configurations from vercel.json and resolves them
 * into ResolvedService objects. Supports both top-level
 * `experimentalServices` and grouped `experimentalServiceGroups`.
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath = '' } = options;
  const services: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];

  // Read vercel.json
  const configPath = workPath ? `${workPath}/vercel.json` : 'vercel.json';
  let experimentalServices: ExperimentalServices | undefined;
  let experimentalServiceGroups: ExperimentalServiceGroups | undefined;

  try {
    const configBuffer = await fs.readFile(configPath);
    const config = JSON.parse(configBuffer.toString('utf-8'));
    experimentalServices = config.experimentalServices;
    experimentalServiceGroups = config.experimentalServiceGroups;
  } catch {
    // No vercel.json or invalid JSON - return empty result
    return { services, errors };
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

  if (
    experimentalServiceGroups &&
    typeof experimentalServiceGroups === 'object'
  ) {
    for (const groupName of Object.keys(experimentalServiceGroups)) {
      const group = experimentalServiceGroups[groupName];

      if (!group.services || typeof group.services !== 'object') {
        errors.push({
          code: 'INVALID_SERVICE_GROUP',
          message: `Service group "${groupName}" is missing required "services" field`,
        });
        continue;
      }

      for (const serviceName of Object.keys(group.services)) {
        const serviceConfig = group.services[serviceName];

        const validationError = validateServiceConfig(
          serviceName,
          serviceConfig
        );
        if (validationError) {
          errors.push(validationError);
          continue;
        }

        const resolved = resolveService(serviceName, serviceConfig, groupName);
        services.push(resolved);
      }
    }
  }

  return { services, errors };
}

export function getDefaultBuilder(runtime: ServiceRuntime): string {
  return RUNTIME_BUILDERS[runtime];
}
