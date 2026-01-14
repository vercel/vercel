import type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from './detectors/filesystem';

export interface ResolvedService {
  name: string;
  type: ServiceType;
  /** Service group name if this service belongs to a group */
  group?: string;
  /* build config */
  workspace: string;
  entrypoint?: string;
  framework?: string;
  builder?: string;
  buildCommand?: string;
  installCommand?: string;
  /* Lambda config */
  runtime?: string;
  memory?: number;
  maxDuration?: number;
  includeFiles?: string | string[];
  excludeFiles?: string | string[];
  /* Web service config */
  routePrefix?: string;
  /* Cron service config */
  schedule?: string;
  /* Worker service config */
  topic?: string;
  consumer?: string;
}

export interface DetectServicesOptions {
  fs: DetectorFilesystem;
  workPath?: string;
}

export interface DetectServicesResult {
  services: ResolvedService[];
  errors: ServiceDetectionError[];
}

export interface ServiceDetectionError {
  code: string;
  message: string;
  serviceName?: string;
}

const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/node',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
};

function validateServiceConfig(
  name: string,
  config: ExperimentalServiceConfig
): ServiceDetectionError | null {
  if (config.type === 'cron' && !config.schedule) {
    return {
      code: 'MISSING_CRON_SCHEDULE',
      message: `Cron service "${name}" is missing required "schedule" field`,
      serviceName: name,
    };
  }

  return null;
}

function resolveService(
  name: string,
  config: ExperimentalServiceConfig,
  group?: string
): ResolvedService {
  const type = config.type || 'web';
  const workspace = config.workspace || '.';
  const topic = type === 'worker' ? config.topic || 'default' : config.topic;
  const consumer =
    type === 'worker' ? config.consumer || 'default' : config.consumer;

  return {
    name,
    type,
    group,
    workspace,
    entrypoint: config.entrypoint,
    routePrefix: config.routePrefix,
    framework: config.framework,
    builder: config.builder,
    runtime: config.runtime,
    buildCommand: config.buildCommand,
    installCommand: config.installCommand,
    memory: config.memory,
    maxDuration: config.maxDuration,
    includeFiles: config.includeFiles,
    excludeFiles: config.excludeFiles,
    schedule: config.schedule,
    topic,
    consumer,
  };
}

/**
 * Detect and resolve services within a project.
 *
 * Currently resolves explicit service configurations from vercel.json.
 * Will be extended to support zero-config detection via code analysis.
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

  // Process top-level experimentalServices
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

  // Process experimentalServiceGroups
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

/**
 * Resolve the full entrypoint path for a service.
 * Combines workspace and entrypoint paths.
 *
 * @example
 * resolveEntrypointPath({ workspace: "apps/api", entrypoint: "src/index.ts" })
 * // → "apps/api/src/index.ts"
 *
 * resolveEntrypointPath({ workspace: ".", entrypoint: "main.py" })
 * // → "main.py"
 */
export function resolveEntrypointPath(
  service: ResolvedService
): string | undefined {
  if (!service.entrypoint) {
    return undefined;
  }

  const workspace = service.workspace;
  if (workspace === '.' || workspace === '') {
    return service.entrypoint;
  }

  return `${workspace}/${service.entrypoint}`;
}
