import type {
  ResolvedService,
  ExperimentalServiceConfig,
  ServiceDetectionError,
} from './types';
import { ENTRYPOINT_EXTENSIONS, RUNTIME_BUILDERS } from './types';
import { getBuilderForRuntime, inferRuntimeFromExtension } from './utils';
import type { ServiceRuntime } from '@vercel/build-utils';
import frameworkList from '@vercel/frameworks';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

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
      message: `Cron service "${name}" is missing required "schedule" field.`,
      serviceName: name,
    };
  }
  if (config.runtime && !(config.runtime in RUNTIME_BUILDERS)) {
    return {
      code: 'INVALID_RUNTIME',
      message: `Service "${name}" has invalid runtime "${config.runtime}".`,
      serviceName: name,
    };
  }
  if (config.framework && !frameworksBySlug.has(config.framework)) {
    return {
      code: 'INVALID_FRAMEWORK',
      message: `Service "${name}" has invalid framework "${config.framework}".`,
      serviceName: name,
    };
  }

  const hasFramework = Boolean(config.framework);
  const hasBuilderOrRuntime = Boolean(config.builder || config.runtime);
  const hasEntrypoint = Boolean(config.entrypoint);

  if (!hasFramework && !hasBuilderOrRuntime && !hasEntrypoint) {
    return {
      code: 'MISSING_SERVICE_CONFIG',
      message: `Service "${name}" must specify "framework", "entrypoint", or both "builder"/"runtime" with "entrypoint".`,
      serviceName: name,
    };
  }
  if (hasBuilderOrRuntime && !hasFramework && !hasEntrypoint) {
    return {
      code: 'MISSING_ENTRYPOINT',
      message: `Service "${name}" must specify "entrypoint" when using "${config.builder ? 'builder' : 'runtime'}".`,
      serviceName: name,
    };
  }
  if (hasEntrypoint && !hasBuilderOrRuntime && !hasFramework) {
    const runtime = inferRuntimeFromExtension(config.entrypoint!);
    if (!runtime) {
      const supported = Object.keys(ENTRYPOINT_EXTENSIONS).join(', ');
      return {
        code: 'UNSUPPORTED_ENTRYPOINT',
        message: `Service "${name}" has unsupported entrypoint "${config.entrypoint}". Use a supported extension (${supported}) or specify "builder", "framework", or "runtime".`,
        serviceName: name,
      };
    }
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

  let builderUse: string;
  let builderSrc: string;

  if (config.framework) {
    const framework = frameworksBySlug.get(config.framework);
    builderUse = framework?.useRuntime?.use || '@vercel/static-build';
    builderSrc = framework?.useRuntime?.src || 'package.json';
  } else if (config.builder) {
    builderUse = config.builder;
    builderSrc = config.entrypoint!;
  } else if (config.runtime) {
    const runtime = config.runtime as ServiceRuntime;
    builderUse = RUNTIME_BUILDERS[runtime];
    builderSrc = config.entrypoint!;
  } else {
    const runtime = inferRuntimeFromExtension(config.entrypoint!);
    builderUse = getBuilderForRuntime(runtime!);
    builderSrc = config.entrypoint!;
  }

  const routePrefix = config.routePrefix ?? '/';

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
      src: builderSrc,
      use: builderUse,
      config: Object.keys(builderConfig).length > 0 ? builderConfig : undefined,
    },
    runtime: config.runtime,
    buildCommand: config.buildCommand,
    installCommand: config.installCommand,
    schedule: config.schedule,
    topic,
    consumer,
  };
}
