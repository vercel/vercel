import type {
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from './detectors/filesystem';

export interface ResolvedService {
  name: string;
  type: ServiceType;
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
  config: ExperimentalServiceConfig
): ResolvedService {
  const type = config.type || 'web';
  const workspace = config.workspace || '.';
  const topic = type === 'worker' ? config.topic || 'default' : config.topic;
  const consumer =
    type === 'worker' ? config.consumer || 'default' : config.consumer;

  return {
    name,
    type,
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

  try {
    const configBuffer = await fs.readFile(configPath);
    const config = JSON.parse(configBuffer.toString('utf-8'));
    experimentalServices = config.experimentalServices;
  } catch {
    // No vercel.json or invalid JSON - return empty result
    return { services, errors };
  }

  if (!experimentalServices || typeof experimentalServices !== 'object') {
    return { services, errors };
  }

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
