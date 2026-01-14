/**
 * Service resolution - transforms detected manifests/entrypoints into
 * fully resolved service configurations.
 */

import type { ServiceRuntime } from '@vercel/build-utils';
import type {
  ResolvedService,
  ExperimentalServiceConfig,
  ServiceDetectionError,
} from './types';
import { RUNTIME_BUILDERS, BUILDER_TO_RUNTIME } from './types';
import { getRuntimeFromExtension } from './entrypoints';

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates an explicit service configuration from vercel.json.
 */
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

  // Entrypoint is required for explicit services
  if (!config.entrypoint) {
    return {
      code: 'MISSING_ENTRYPOINT',
      message: `Service "${name}" is missing required "entrypoint" field.`,
      serviceName: name,
    };
  }

  // Must have either builder or runtime to determine the builder
  if (!config.builder && !config.runtime) {
    return {
      code: 'MISSING_BUILDER_OR_RUNTIME',
      message: `Service "${name}" must specify either "builder" or "runtime".`,
      serviceName: name,
    };
  }

  // Validate runtime if provided
  if (config.runtime && !RUNTIME_BUILDERS[config.runtime as ServiceRuntime]) {
    return {
      code: 'INVALID_RUNTIME',
      message: `Service "${name}" has invalid runtime "${config.runtime}". Valid runtimes: ${Object.keys(RUNTIME_BUILDERS).join(', ')}`,
      serviceName: name,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Resolution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolves an explicit service configuration into a ResolvedService.
 */
export function resolveExplicitService(
  name: string,
  config: ExperimentalServiceConfig,
  workspace = '.'
): ResolvedService {
  // Determine the builder
  let builderUse: string;
  let runtimeFamily: ServiceRuntime | undefined;

  if (config.builder) {
    // Explicit builder takes precedence
    builderUse = config.builder;
    runtimeFamily = BUILDER_TO_RUNTIME[config.builder];
  } else if (config.runtime) {
    // Runtime specified
    runtimeFamily = config.runtime as ServiceRuntime;
    builderUse = RUNTIME_BUILDERS[runtimeFamily];
  } else {
    // Infer from entrypoint extension
    runtimeFamily = getRuntimeFromExtension(config.entrypoint!) ?? undefined;
    builderUse = runtimeFamily
      ? RUNTIME_BUILDERS[runtimeFamily]
      : '@vercel/node';
  }

  // Determine route prefix (default to service name if not root)
  const routePrefix =
    config.routePrefix ?? (name === 'default' ? '/' : `/${name}`);

  return {
    name,
    type: config.type ?? 'web',
    workspace,
    entrypoint: config.entrypoint!,
    framework: config.framework,
    builder: {
      src: config.entrypoint!,
      use: builderUse,
      config: buildConfig(config),
    },
    buildCommand: config.buildCommand,
    installCommand: config.installCommand,
    runtime: config.runtime,
    runtimeFamily,
    memory: config.memory,
    maxDuration: config.maxDuration,
    includeFiles: config.includeFiles,
    excludeFiles: config.excludeFiles,
    routePrefix,
    schedule: config.schedule,
  };
}

/**
 * Creates a resolved service from auto-detected information.
 */
export function resolveAutoDetectedService(
  name: string,
  entrypoint: string,
  runtime: ServiceRuntime,
  workspace: string
): ResolvedService {
  const builder = RUNTIME_BUILDERS[runtime];
  const routePrefix = name === 'default' ? '/' : `/${name}`;

  return {
    name,
    type: 'web',
    workspace,
    entrypoint,
    builder: {
      src: entrypoint,
      use: builder,
    },
    runtimeFamily: runtime,
    routePrefix,
  };
}

/**
 * Derives service name from directory path.
 */
export function deriveServiceName(directory: string): string {
  if (directory === '.') return 'default';
  // Use the last segment of the path as the service name
  const segments = directory.split('/');
  return segments[segments.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds the config object for a builder.
 */
function buildConfig(
  config: ExperimentalServiceConfig
): Record<string, unknown> {
  const builderConfig: Record<string, unknown> = {};

  if (config.memory) builderConfig.memory = config.memory;
  if (config.maxDuration) builderConfig.maxDuration = config.maxDuration;
  if (config.includeFiles) builderConfig.includeFiles = config.includeFiles;
  if (config.excludeFiles) builderConfig.excludeFiles = config.excludeFiles;

  return Object.keys(builderConfig).length > 0 ? builderConfig : {};
}
