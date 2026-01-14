import type {
  ResolvedService,
  ExperimentalServiceConfig,
  ServiceDetectionError,
} from './types';
import { RUNTIME_BUILDERS, ENTRYPOINT_EXTENSIONS } from './types';
import type { ServiceRuntime } from '@vercel/build-utils';

/**
 * Get runtime from file extension.
 */
export function getRuntimeFromExtension(
  entrypoint: string
): ServiceRuntime | null {
  for (const [ext, runtime] of Object.entries(ENTRYPOINT_EXTENSIONS)) {
    if (entrypoint.endsWith(ext)) {
      return runtime;
    }
  }
  return null;
}

export function validateServiceConfig(
  name: string,
  config: ExperimentalServiceConfig
): ServiceDetectionError | null {
  if (!config || typeof config !== 'object') {
    return {
      code: 'INVALID_SERVICE_CONFIG',
      message: `Service "${name}" has an invalid configuration. Expected an object.`,
      serviceName: name,
    };
  }

  if (config.type === 'cron' && !config.schedule) {
    return {
      code: 'MISSING_CRON_SCHEDULE',
      message: `Cron service "${name}" is missing required "schedule" field`,
      serviceName: name,
    };
  }

  return null;
}

export function resolveService(
  name: string,
  config: ExperimentalServiceConfig,
  group?: string
): ResolvedService {
  const type = config.type || 'web';
  const workspace = config.workspace || '.';
  const topic = type === 'worker' ? config.topic || 'default' : config.topic;
  const consumer =
    type === 'worker' ? config.consumer || 'default' : config.consumer;

  // Determine the builder
  let builderUse: string;

  if (config.builder) {
    // Explicit builder takes precedence
    builderUse = config.builder;
  } else if (config.runtime) {
    // Runtime specified - map to builder
    const runtime = config.runtime as ServiceRuntime;
    builderUse = RUNTIME_BUILDERS[runtime] || '@vercel/node';
  } else if (config.entrypoint) {
    // Infer from entrypoint extension
    const runtime = getRuntimeFromExtension(config.entrypoint);
    builderUse = runtime ? RUNTIME_BUILDERS[runtime] : '@vercel/node';
  } else {
    // Default to node
    builderUse = '@vercel/node';
  }

  // Determine route prefix (default to service name if not root)
  const routePrefix =
    config.routePrefix ?? (name === 'default' ? '/' : `/${name}`);

  // Build the builder config
  const builderConfig: Record<string, unknown> = {};
  if (config.memory) builderConfig.memory = config.memory;
  if (config.maxDuration) builderConfig.maxDuration = config.maxDuration;
  if (config.includeFiles) builderConfig.includeFiles = config.includeFiles;
  if (config.excludeFiles) builderConfig.excludeFiles = config.excludeFiles;

  return {
    name,
    type,
    group,
    workspace,
    entrypoint: config.entrypoint,
    routePrefix,
    framework: config.framework,
    builder: {
      src: config.entrypoint || '',
      use: builderUse,
      config: Object.keys(builderConfig).length > 0 ? builderConfig : undefined,
    },
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
