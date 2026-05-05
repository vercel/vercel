import { posix as posixPath } from 'path';
import { JOB_TRIGGERS, type JobTrigger } from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import type {
  ExperimentalServiceConfig,
  ResolvedEntrypointPath,
  Service,
  ServiceDetectionError,
} from './types';
import {
  ENTRYPOINT_EXTENSIONS,
  ROUTE_OWNING_BUILDERS,
  RUNTIME_BUILDERS,
  STATIC_BUILDERS,
} from './types';
import {
  inferRuntimeFromFramework,
  inferServiceRuntime,
  INTERNAL_SERVICE_PREFIX,
} from './utils';
import {
  isReservedServiceRoutePrefix,
  type ResolvedServiceRoutingConfig,
} from './routing';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

const SERVICE_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
const DNS_LABEL_RE = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const ENV_PREFIX_RE = /^[A-Z][A-Z0-9_]*_$/;

// --- Field-level validators ---

export function validateServiceName(
  name: string
): ServiceDetectionError | null {
  if (SERVICE_NAME_REGEX.test(name)) {
    return null;
  }
  return {
    code: 'INVALID_SERVICE_NAME',
    message: `Service name "${name}" is invalid. Names must start with a letter, end with an alphanumeric character, and contain only alphanumeric characters, hyphens, and underscores.`,
    serviceName: name,
  };
}

export function validateServiceConfigShape(
  name: string,
  config: unknown
): ServiceDetectionError | null {
  if (config && typeof config === 'object') {
    return null;
  }
  return {
    code: 'INVALID_SERVICE_CONFIG',
    message: `Service "${name}" has an invalid configuration. Expected an object.`,
    serviceName: name,
  };
}

function validateSubdomain(
  name: string,
  configuredSubdomain: string | undefined
): ServiceDetectionError | null {
  if (typeof configuredSubdomain !== 'string') {
    return null;
  }
  if (DNS_LABEL_RE.test(configuredSubdomain)) {
    return null;
  }
  return {
    code: 'INVALID_SUBDOMAIN',
    message: `Web service "${name}" has invalid subdomain "${configuredSubdomain}". Use a single DNS label such as "api".`,
    serviceName: name,
  };
}

function validateWebServiceHasRoute(
  name: string,
  hasRoutePrefix: boolean,
  hasSubdomain: boolean,
  hasRoutingPaths: boolean
): ServiceDetectionError | null {
  if (hasRoutePrefix || hasSubdomain || hasRoutingPaths) {
    return null;
  }
  return {
    code: 'MISSING_ROUTE_PREFIX',
    message: `Web service "${name}" must specify at least one of "mount", "routing", "routePrefix", or "subdomain".`,
    serviceName: name,
  };
}

function validateWebServiceReservedRoutePrefix(
  name: string,
  configuredRoutePrefix: string | undefined
): ServiceDetectionError | null {
  if (!configuredRoutePrefix) {
    return null;
  }
  if (!isReservedServiceRoutePrefix(configuredRoutePrefix)) {
    return null;
  }
  return {
    code: 'RESERVED_ROUTE_PREFIX',
    message: `Web service "${name}" cannot use routePrefix "${configuredRoutePrefix}". The "${INTERNAL_SERVICE_PREFIX}" prefix is reserved for internal services routing.`,
    serviceName: name,
  };
}

function validateNonWebServiceRouting(
  name: string,
  serviceTypeLabel: string,
  configuredRoutePrefix: string | undefined,
  hasSubdomain: boolean,
  hasRoutingPaths: boolean
): ServiceDetectionError | null {
  if (configuredRoutePrefix || hasRoutingPaths) {
    return {
      code: 'INVALID_ROUTE_PREFIX',
      message: `${serviceTypeLabel} service "${name}" cannot have "routePrefix", "mount", or "routing". Only web services should specify path-based routing.`,
      serviceName: name,
    };
  }
  if (hasSubdomain) {
    return {
      code: 'INVALID_HOST_ROUTING_CONFIG',
      message: `${serviceTypeLabel} service "${name}" cannot have "subdomain" or "mount.subdomain". Only web services should specify subdomain routing.`,
      serviceName: name,
    };
  }
  return null;
}

function validateJobConfig(
  name: string,
  serviceType: string,
  serviceTypeLabel: string,
  config: ExperimentalServiceConfig
): ServiceDetectionError | null {
  const isScheduleJobService =
    serviceType === 'cron' ||
    (serviceType === 'job' && config.trigger === 'schedule');
  const isQueueJobService = serviceType === 'job' && config.trigger === 'queue';
  const isWorkflowService =
    serviceType === 'job' && config.trigger === 'workflow';

  if (serviceType === 'job' && config.trigger === undefined) {
    return {
      code: 'MISSING_JOB_TRIGGER',
      message: `Job service "${name}" is missing required "trigger" field.`,
      serviceName: name,
    };
  }
  if (
    serviceType === 'job' &&
    config.trigger &&
    !JOB_TRIGGERS.includes(config.trigger)
  ) {
    return {
      code: 'INVALID_JOB_TRIGGER',
      message: `Job service "${name}" has invalid trigger "${config.trigger}". Expected ${JOB_TRIGGERS.map((t: JobTrigger) => `"${t}"`).join(', ')}.`,
      serviceName: name,
    };
  }
  if (isScheduleJobService && !config.schedule) {
    return {
      code:
        serviceType === 'cron'
          ? 'MISSING_CRON_SCHEDULE'
          : 'MISSING_JOB_SCHEDULE',
      message: `${serviceTypeLabel} service "${name}" is missing required "schedule" field.`,
      serviceName: name,
    };
  }
  if (
    isQueueJobService &&
    (!Array.isArray(config.topics) || config.topics.length === 0)
  ) {
    return {
      code: 'MISSING_QUEUE_TOPICS',
      message: `${serviceTypeLabel} service "${name}" is missing required "topics" field.`,
      serviceName: name,
    };
  }
  if (isWorkflowService && typeof config.entrypoint !== 'string') {
    return {
      code: 'MISSING_ENTRYPOINT',
      message: `Job service "${name}" with "workflow" trigger must specify "entrypoint".`,
      serviceName: name,
    };
  }
  return null;
}

function validateServiceRoot(
  name: string,
  root: string | undefined
): ServiceDetectionError | null {
  if (root === undefined) {
    return null;
  }
  const normalizedRoot = posixPath.normalize(root);
  if (normalizedRoot.startsWith('/')) {
    return {
      code: 'INVALID_ROOT',
      message: `Service "${name}" has invalid "root" "${root}". Must be a relative path.`,
      serviceName: name,
    };
  }
  if (normalizedRoot === '..' || normalizedRoot.startsWith('../')) {
    return {
      code: 'INVALID_ROOT',
      message: `Service "${name}" has invalid "root" "${root}". Must not escape the project root.`,
      serviceName: name,
    };
  }
  return null;
}

function validateEnvPrefix(
  name: string,
  envPrefix: string | undefined
): ServiceDetectionError | null {
  if (envPrefix === undefined) {
    return null;
  }
  if (ENV_PREFIX_RE.test(envPrefix)) {
    return null;
  }
  return {
    code: 'INVALID_ENV_PREFIX',
    message: `Service "${name}" has invalid envPrefix "${envPrefix}". Must start with an uppercase letter, contain only uppercase letters, digits, and underscores, and end with "_" (e.g., "MY_SERVICE_").`,
    serviceName: name,
  };
}

function validateRuntimeAndFramework(
  name: string,
  config: ExperimentalServiceConfig
): ServiceDetectionError | null {
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
  if (config.runtime && config.framework) {
    const frameworkRuntime = inferRuntimeFromFramework(config.framework);
    if (frameworkRuntime && frameworkRuntime !== config.runtime) {
      return {
        code: 'RUNTIME_FRAMEWORK_MISMATCH',
        message: `Service "${name}" has conflicting runtime/framework: runtime "${config.runtime}" is incompatible with framework "${config.framework}" (runtime "${frameworkRuntime}").`,
        serviceName: name,
      };
    }
  }
  return null;
}

function validateServiceSourceConfiguration(
  name: string,
  config: ExperimentalServiceConfig
): ServiceDetectionError | null {
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
  return null;
}

// --- Public composites ---

/**
 * Validate a service configuration from vercel.json experimentalServices.
 * Runs every semantic validator in a fixed order against the raw config and
 * pre-resolved routing state, returning the first error encountered.
 */
export function validateServiceConfig(
  name: string,
  config: ExperimentalServiceConfig,
  routing: ResolvedServiceRoutingConfig
): ServiceDetectionError | null {
  const serviceType = config.type || 'web';
  const isJobService = serviceType === 'job' || serviceType === 'cron';
  const isNonWebService = serviceType === 'worker' || isJobService;
  const serviceTypeLabel = isJobService
    ? 'Job'
    : serviceType === 'worker'
      ? 'Worker'
      : 'Web';

  const configuredRoutePrefix = routing.routePrefix;
  const configuredSubdomain = routing.subdomain;
  const configuredRoutingPaths = routing.routingPaths;
  const hasRoutePrefix = typeof configuredRoutePrefix === 'string';
  const hasSubdomain = typeof configuredSubdomain === 'string';
  const hasRoutingPaths =
    Array.isArray(configuredRoutingPaths) && configuredRoutingPaths.length > 0;

  const subdomainError = validateSubdomain(name, configuredSubdomain);
  if (subdomainError) return subdomainError;

  if (serviceType === 'web') {
    const missingRouteError = validateWebServiceHasRoute(
      name,
      hasRoutePrefix,
      hasSubdomain,
      hasRoutingPaths
    );
    if (missingRouteError) return missingRouteError;

    const reservedError = validateWebServiceReservedRoutePrefix(
      name,
      configuredRoutePrefix
    );
    if (reservedError) return reservedError;
  }

  if (isNonWebService) {
    const nonWebRoutingError = validateNonWebServiceRouting(
      name,
      serviceTypeLabel,
      configuredRoutePrefix,
      hasSubdomain,
      hasRoutingPaths
    );
    if (nonWebRoutingError) return nonWebRoutingError;
  }

  const jobError = validateJobConfig(
    name,
    serviceType,
    serviceTypeLabel,
    config
  );
  if (jobError) return jobError;

  const rootError = validateServiceRoot(name, config.root);
  if (rootError) return rootError;

  const envError = validateEnvPrefix(name, config.envPrefix);
  if (envError) return envError;

  const runtimeError = validateRuntimeAndFramework(name, config);
  if (runtimeError) return runtimeError;

  const sourceError = validateServiceSourceConfiguration(name, config);
  if (sourceError) return sourceError;

  return null;
}

/**
 * Validate that a resolved entrypoint has enough information for the builder
 * pipeline. File entrypoints without builder/runtime/framework must have a
 * supported extension so the runtime can be inferred.
 */
export function validateServiceEntrypoint(
  name: string,
  config: ExperimentalServiceConfig,
  resolvedEntrypoint: ResolvedEntrypointPath
): ServiceDetectionError | null {
  // File entrypoints without builder/runtime/framework must have a supported extension.
  // Use the resolved path (e.g. "jobs/cleanup.py") for runtime inference so that
  // module:function entrypoints (e.g. "jobs.cleanup:handler") resolve correctly
  // via their underlying file extension.
  if (
    !resolvedEntrypoint.isDirectory &&
    !config.builder &&
    !config.runtime &&
    !config.framework
  ) {
    const runtime = inferServiceRuntime({
      ...config,
      entrypoint: resolvedEntrypoint.normalized,
    });
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
 * Validate that a resolved service is allowed to use the `routing` config.
 * Services routing is currently limited to non-static, non-route-owning
 * backends — static/frontend builders need a canonical mount path, and
 * route-owning builders (Next.js, @vercel/backends) aren't supported yet.
 */
export function validateResolvedServiceRoutingSupport(
  service: Service
): ServiceDetectionError | null {
  if (
    service.type !== 'web' ||
    !service.routingPaths ||
    service.routingPaths.length === 0
  ) {
    return null;
  }

  const builderOrFramework = service.framework || service.builder.use;
  if (STATIC_BUILDERS.has(service.builder.use)) {
    return {
      code: 'UNSUPPORTED_ROUTING_BUILDER',
      message: `Web service "${service.name}" cannot use "routing" with "${builderOrFramework}". Static and frontend services need a canonical public base path. Use "mount" for stable subpath hosting.`,
      serviceName: service.name,
    };
  }

  if (ROUTE_OWNING_BUILDERS.has(service.builder.use)) {
    return {
      code: 'UNSUPPORTED_ROUTING_BUILDER',
      message: `Web service "${service.name}" cannot use "routing" with "${builderOrFramework}" yet. Services routing currently supports simple subtree ownership for non-route-owning backends only. Use "mount" for canonical hosting, or microfrontends for richer app composition.`,
      serviceName: service.name,
    };
  }

  return null;
}
