import { posix as posixPath } from 'path';
import type {
  ResolvedService,
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceDetectionError,
} from './types';
import {
  ENTRYPOINT_EXTENSIONS,
  RUNTIME_BUILDERS,
  STATIC_BUILDERS,
} from './types';
import { getBuilderForRuntime, inferServiceRuntime } from './utils';
import frameworkList from '@vercel/frameworks';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

const SERVICE_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;

/**
 * Validate a service configuration from vercel.json experimentalServices.
 */
export function validateServiceConfig(
  name: string,
  config: ExperimentalServiceConfig
): ServiceDetectionError | null {
  if (!SERVICE_NAME_REGEX.test(name)) {
    return {
      code: 'INVALID_SERVICE_NAME',
      message: `Service name "${name}" is invalid. Names must start with a letter, end with an alphanumeric character, and contain only alphanumeric characters, hyphens, and underscores.`,
      serviceName: name,
    };
  }
  if (!config || typeof config !== 'object') {
    return {
      code: 'INVALID_SERVICE_CONFIG',
      message: `Service "${name}" has an invalid configuration. Expected an object.`,
      serviceName: name,
    };
  }
  const serviceType = config.type || 'web';
  if (serviceType === 'web' && !config.routePrefix) {
    return {
      code: 'MISSING_ROUTE_PREFIX',
      message: `Web service "${name}" must specify "routePrefix".`,
      serviceName: name,
    };
  }
  if (
    (serviceType === 'worker' || serviceType === 'cron') &&
    config.routePrefix
  ) {
    return {
      code: 'INVALID_ROUTE_PREFIX',
      message: `${serviceType === 'worker' ? 'Worker' : 'Cron'} service "${name}" cannot have "routePrefix". Only web services should specify "routePrefix".`,
      serviceName: name,
    };
  }
  if (serviceType === 'cron' && !config.schedule) {
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
    const runtime = inferServiceRuntime({ entrypoint: config.entrypoint });
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

/**
 * Resolve a single service from user configuration.
 */
export function resolveConfiguredService(
  name: string,
  config: ExperimentalServiceConfig,
  group?: string
): ResolvedService {
  const type = config.type || 'web';
  const workspace = config.workspace || '.';
  const topic = type === 'worker' ? config.topic || 'default' : config.topic;
  const consumer =
    type === 'worker' ? config.consumer || 'default' : config.consumer;

  const inferredRuntime = inferServiceRuntime(config);

  let builderUse: string;
  let builderSrc: string;

  if (config.framework) {
    const framework = frameworksBySlug.get(config.framework);
    builderUse = framework?.useRuntime?.use || '@vercel/static-build';
    // Prefer user-provided entrypoint over framework default
    builderSrc =
      config.entrypoint || framework?.useRuntime?.src || 'package.json';
  } else if (config.builder) {
    builderUse = config.builder;
    builderSrc = config.entrypoint!;
  } else {
    builderUse = getBuilderForRuntime(inferredRuntime!);
    builderSrc = config.entrypoint!;
  }

  // routePrefix is required for web services; normalize to always start with /
  const routePrefix =
    type === 'web' && config.routePrefix
      ? config.routePrefix.startsWith('/')
        ? config.routePrefix
        : `/${config.routePrefix}`
      : undefined;

  // Ensure builder.src is fully qualified for non-root workspaces.
  // Always prepend — the entrypoint in the config is relative to the workspace,
  // never repo-root-relative.
  const isRoot = workspace === '.';
  if (!isRoot) {
    builderSrc = posixPath.join(workspace, builderSrc);
  }

  // Services are built via the zero-config pipeline (multiple builders, merged routes).
  // Ensure `zeroConfig` is set on the Builder spec so downstream steps (like
  // CLI `writeBuildResultV3()`) can compute correct extensionless function paths.
  const builderConfig: Record<string, unknown> = { zeroConfig: true };
  if (config.memory) builderConfig.memory = config.memory;
  if (config.maxDuration) builderConfig.maxDuration = config.maxDuration;
  if (config.includeFiles) builderConfig.includeFiles = config.includeFiles;
  if (config.excludeFiles) builderConfig.excludeFiles = config.excludeFiles;

  const isStaticBuild = STATIC_BUILDERS.has(builderUse);
  const runtime = isStaticBuild ? undefined : inferredRuntime;

  // Pass routePrefix to builder config as a filesystem mountpoint.
  // static-build uses this to prefix output paths: '.' = root, 'admin' = /admin/
  // We strip the leading slash since it's a relative path, not a URL.
  if (routePrefix) {
    const stripped = routePrefix.startsWith('/')
      ? routePrefix.slice(1)
      : routePrefix;
    builderConfig.routePrefix = stripped || '.';
  }
  if (config.framework) {
    builderConfig.framework = config.framework;
  }

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
    runtime,
    buildCommand: config.buildCommand,
    installCommand: config.installCommand,
    schedule: config.schedule,
    topic,
    consumer,
  };
}

/**
 * Resolve all services from vercel.json experimentalServices.
 * Validates each service configuration.
 */
export function resolveAllConfiguredServices(services: ExperimentalServices): {
  services: ResolvedService[];
  errors: ServiceDetectionError[];
} {
  const resolved: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];

  for (const name of Object.keys(services)) {
    const serviceConfig = services[name];

    const validationError = validateServiceConfig(name, serviceConfig);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    const service = resolveConfiguredService(name, serviceConfig);
    resolved.push(service);
  }

  return { services: resolved, errors };
}
