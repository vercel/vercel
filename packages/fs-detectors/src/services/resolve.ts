import type {
  ResolvedService,
  ExperimentalServiceConfig,
  ServiceDetectionError,
} from './types';

export function validateServiceConfig(
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
