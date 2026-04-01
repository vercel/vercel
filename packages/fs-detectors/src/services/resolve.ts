import { posix as posixPath } from 'path';
import type {
  Service,
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceDetectionError,
  ServiceRuntime,
} from './types';
import { getWorkerTopics } from '@vercel/build-utils';
import {
  ENTRYPOINT_EXTENSIONS,
  RUNTIME_BUILDERS,
  STATIC_BUILDERS,
  RUNTIME_MANIFESTS,
} from './types';
import {
  filterFrameworksByRuntime,
  getBuilderForRuntime,
  hasFile,
  inferRuntimeFromFramework,
  inferServiceRuntime,
  INTERNAL_SERVICE_PREFIX,
} from './utils';
import { frameworkList } from '@vercel/frameworks';
import { detectFrameworks } from '../detect-framework';
import type { DetectorFilesystem } from '../detectors/filesystem';
import { normalizeRoutePrefix } from '@vercel/routing-utils';
import { isNodeBackendFramework } from '@vercel/build-utils';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

/**
 * Match a Python `module:attr` entrypoint (e.g. `backend.jobs.scheduled:cleanup`).
 * Kept inline to avoid coupling fs-detectors to a Python-specific package.
 * Real verification would happen at the build time.
 */
const PYTHON_MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

function parsePyModuleAttrEntrypoint(entrypoint: string): {
  attrName: string;
  filePath: string;
} | null {
  const match = PYTHON_MODULE_ATTR_RE.exec(entrypoint);
  if (!match) return null;
  return {
    attrName: match[2],
    filePath: match[1].replace(/\./g, '/') + '.py',
  };
}

const SERVICE_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
const DNS_LABEL_RE = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const ENV_PREFIX_RE = /^[A-Z][A-Z0-9_]*_$/;

interface ResolvedEntrypointPath {
  normalized: string;
  isDirectory: boolean;
}

function normalizeServiceEntrypoint(entrypoint: string): string {
  const normalized = posixPath.normalize(entrypoint);
  return normalized === '' ? '.' : normalized;
}

async function resolveEntrypointPath({
  fs,
  serviceName,
  entrypoint,
}: {
  fs: DetectorFilesystem;
  serviceName: string;
  entrypoint: string;
}): Promise<{
  entrypoint?: ResolvedEntrypointPath;
  error?: ServiceDetectionError;
}> {
  const normalized = normalizeServiceEntrypoint(entrypoint);

  if (!(await fs.hasPath(normalized))) {
    return {
      error: {
        code: 'ENTRYPOINT_NOT_FOUND',
        message: `Service "${serviceName}" has entrypoint "${entrypoint}" but that path does not exist.`,
        serviceName,
      },
    };
  }

  return {
    entrypoint: {
      normalized,
      isDirectory: !(await fs.isFile(normalized)),
    },
  };
}

type RoutePrefixSource = 'configured' | 'generated';

interface ResolveConfiguredServiceOptions {
  name: string;
  config: ExperimentalServiceConfig;
  fs: DetectorFilesystem;
  group?: string;
  resolvedEntrypoint?: ResolvedEntrypointPath;
  routePrefixSource?: RoutePrefixSource;
}
function toWorkspaceRelativeEntrypoint(
  entrypoint: string,
  workspace: string
): string {
  const normalizedEntrypoint = posixPath.normalize(entrypoint);
  if (workspace === '.') {
    return normalizedEntrypoint;
  }
  const workspacePrefix = `${workspace}/`;
  if (normalizedEntrypoint.startsWith(workspacePrefix)) {
    return normalizedEntrypoint.slice(workspacePrefix.length);
  }
  const relativeEntrypoint = posixPath.relative(
    workspace,
    normalizedEntrypoint
  );
  if (relativeEntrypoint === '' || relativeEntrypoint.startsWith('..')) {
    return normalizedEntrypoint;
  }
  return relativeEntrypoint;
}

async function inferWorkspaceFromNearestManifest({
  fs,
  entrypoint,
  runtime,
}: {
  fs: DetectorFilesystem;
  entrypoint?: string;
  runtime?: ServiceRuntime;
}): Promise<string | undefined> {
  if (!entrypoint || !runtime) {
    return undefined;
  }
  const manifests = RUNTIME_MANIFESTS[runtime];
  if (!manifests || manifests.length === 0) {
    return undefined;
  }

  let dir = posixPath.dirname(posixPath.normalize(entrypoint)) || '.';
  if (dir === '') {
    dir = '.';
  }

  let reachedRoot = false;
  while (!reachedRoot) {
    for (const manifest of manifests) {
      const manifestPath =
        dir === '.' ? manifest : posixPath.join(dir, manifest);
      if (await hasFile(fs, manifestPath)) {
        return dir;
      }
    }
    if (dir === '.' || dir === '/') {
      reachedRoot = true;
    } else {
      const parent = posixPath.dirname(dir);
      if (!parent || parent === dir) {
        reachedRoot = true;
      } else {
        dir = parent;
      }
    }
  }

  return undefined;
}

async function detectFrameworkFromWorkspace({
  fs,
  workspace,
  serviceName,
  runtime,
}: {
  fs: DetectorFilesystem;
  workspace: string;
  serviceName: string;
  runtime?: ServiceRuntime;
}): Promise<{ framework?: string; error?: ServiceDetectionError }> {
  const serviceFs = workspace === '.' ? fs : fs.chdir(workspace);
  const frameworkCandidates = filterFrameworksByRuntime(frameworkList, runtime);
  const frameworks = await detectFrameworks({
    fs: serviceFs,
    frameworkList: frameworkCandidates,
  });

  if (frameworks.length > 1) {
    const frameworkNames = frameworks.map(f => f.name).join(', ');
    return {
      error: {
        code: 'MULTIPLE_FRAMEWORKS_SERVICE',
        message: `Multiple frameworks detected in ${workspace === '.' ? 'project root' : `${workspace}/`}: ${frameworkNames}. Specify "framework" explicitly in experimentalServices.`,
        serviceName,
      },
    };
  }

  if (frameworks.length === 1) {
    return {
      framework: frameworks[0].slug ?? undefined,
    };
  }

  return {};
}

function isReservedServiceRoutePrefix(routePrefix: string): boolean {
  const normalized = normalizeRoutePrefix(routePrefix);
  return (
    normalized === INTERNAL_SERVICE_PREFIX ||
    normalized.startsWith(`${INTERNAL_SERVICE_PREFIX}/`)
  );
}

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
  const hasRoutePrefix = typeof config.routePrefix === 'string';
  const hasSubdomain = typeof config.subdomain === 'string';
  const hasEntrypoint = typeof config.entrypoint === 'string';
  const hasCommand = typeof config.command === 'string';

  if (hasSubdomain && !DNS_LABEL_RE.test(config.subdomain!)) {
    return {
      code: 'INVALID_SUBDOMAIN',
      message: `Web service "${name}" has invalid subdomain "${config.subdomain}". Use a single DNS label such as "api".`,
      serviceName: name,
    };
  }

  if (serviceType === 'web' && !hasRoutePrefix && !hasSubdomain) {
    return {
      code: 'MISSING_ROUTE_PREFIX',
      message: `Web service "${name}" must specify at least one of "routePrefix" or "subdomain".`,
      serviceName: name,
    };
  }
  if (
    serviceType === 'web' &&
    config.routePrefix &&
    isReservedServiceRoutePrefix(config.routePrefix)
  ) {
    return {
      code: 'RESERVED_ROUTE_PREFIX',
      message: `Web service "${name}" cannot use routePrefix "${config.routePrefix}". The "${INTERNAL_SERVICE_PREFIX}" prefix is reserved for internal services routing.`,
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
  if ((serviceType === 'worker' || serviceType === 'cron') && hasSubdomain) {
    return {
      code: 'INVALID_HOST_ROUTING_CONFIG',
      message: `${serviceType === 'worker' ? 'Worker' : 'Cron'} service "${name}" cannot have "subdomain". Only web services should specify subdomain routing.`,
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
  if (hasCommand && serviceType !== 'cron') {
    return {
      code: 'INVALID_COMMAND_CONFIG',
      message: `Service "${name}" cannot specify "command". Only cron services currently support "command".`,
      serviceName: name,
    };
  }
  if (hasCommand && hasEntrypoint) {
    return {
      code: 'CONFLICTING_COMMAND_ENTRYPOINT',
      message: `Cron service "${name}" cannot specify both "entrypoint" and "command". Use exactly one.`,
      serviceName: name,
    };
  }
  if (hasCommand && !config.command!.trim()) {
    return {
      code: 'EMPTY_COMMAND',
      message: `Cron service "${name}" has an empty "command". Provide a non-empty shell command.`,
      serviceName: name,
    };
  }
  if (hasCommand && config.framework) {
    return {
      code: 'INVALID_COMMAND_FRAMEWORK',
      message: `Cron service "${name}" cannot specify "framework" when using "command". Specify "runtime": "python" instead.`,
      serviceName: name,
    };
  }
  if (hasCommand && config.builder) {
    return {
      code: 'INVALID_COMMAND_BUILDER',
      message: `Cron service "${name}" cannot specify "builder" when using "command". Specify "runtime": "python" instead.`,
      serviceName: name,
    };
  }
  if (hasCommand && config.runtime !== 'python') {
    return {
      code: 'INVALID_COMMAND_RUNTIME',
      message: `Cron service "${name}" using "command" must specify "runtime": "python".`,
      serviceName: name,
    };
  }
  if (config.envPrefix !== undefined) {
    if (!ENV_PREFIX_RE.test(config.envPrefix)) {
      return {
        code: 'INVALID_ENV_PREFIX',
        message: `Service "${name}" has invalid envPrefix "${config.envPrefix}". Must start with an uppercase letter, contain only uppercase letters, digits, and underscores, and end with "_" (e.g., "MY_SERVICE_").`,
        serviceName: name,
      };
    }
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

  const hasFramework = Boolean(config.framework);
  const hasBuilderOrRuntime = Boolean(config.builder || config.runtime);

  if (!hasFramework && !hasBuilderOrRuntime && !hasEntrypoint && !hasCommand) {
    return {
      code: 'MISSING_SERVICE_CONFIG',
      message: `Service "${name}" must specify "framework", "entrypoint", or "command" (cron services only).`,
      serviceName: name,
    };
  }
  if (hasBuilderOrRuntime && !hasFramework && !hasEntrypoint && !hasCommand) {
    return {
      code: 'MISSING_ENTRYPOINT',
      message: `Service "${name}" must specify "entrypoint" when using "${config.builder ? 'builder' : 'runtime'}".`,
      serviceName: name,
    };
  }
  return null;
}

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
 * Resolve a single service from user configuration.
 */
export async function resolveConfiguredService(
  options: ResolveConfiguredServiceOptions
): Promise<Service> {
  const {
    name,
    config,
    fs,
    group,
    resolvedEntrypoint,
    routePrefixSource = 'configured',
  } = options;
  const type = config.type || 'web';
  const rawEntrypoint = config.entrypoint;
  const rawCommand = config.command;
  const hasCommand = typeof rawCommand === 'string';

  const moduleAttrParsed =
    typeof rawEntrypoint === 'string' && type === 'cron' && !hasCommand
      ? parsePyModuleAttrEntrypoint(rawEntrypoint)
      : null;

  let resolvedEntrypointPath = resolvedEntrypoint;
  if (!resolvedEntrypointPath && typeof rawEntrypoint === 'string') {
    const entrypointToResolve = moduleAttrParsed
      ? moduleAttrParsed.filePath
      : rawEntrypoint;
    const resolved = await resolveEntrypointPath({
      fs,
      serviceName: name,
      entrypoint: entrypointToResolve,
    });
    resolvedEntrypointPath = resolved.entrypoint;
  }
  if (typeof rawEntrypoint === 'string' && !resolvedEntrypointPath) {
    throw new Error(
      `Failed to resolve entrypoint "${rawEntrypoint}" for service "${name}".`
    );
  }
  const normalizedEntrypoint = resolvedEntrypointPath?.normalized;
  const entrypointIsDirectory = Boolean(resolvedEntrypointPath?.isDirectory);

  const inferredRuntime = inferServiceRuntime({
    ...config,
    entrypoint: entrypointIsDirectory ? undefined : normalizedEntrypoint,
  });
  let workspace = '.';
  let resolvedEntrypointFile =
    entrypointIsDirectory || !normalizedEntrypoint
      ? undefined
      : normalizedEntrypoint;

  if (!hasCommand) {
    // Directory entrypoints define the service workspace directly.
    if (entrypointIsDirectory && normalizedEntrypoint) {
      workspace = normalizedEntrypoint;
    } else {
      // File entrypoints infer workspace from nearest runtime manifest.
      const inferredWorkspace = await inferWorkspaceFromNearestManifest({
        fs,
        entrypoint: resolvedEntrypointFile,
        runtime: inferredRuntime,
      });
      if (inferredWorkspace) {
        workspace = inferredWorkspace;
        if (resolvedEntrypointFile) {
          resolvedEntrypointFile = toWorkspaceRelativeEntrypoint(
            resolvedEntrypointFile,
            inferredWorkspace
          );
        }
      }
    }
  }

  const topics = type === 'worker' ? getWorkerTopics(config) : config.topics;
  const consumer =
    type === 'worker' ? config.consumer || 'default' : config.consumer;

  let builderUse: string;
  let builderSrc: string;

  const frameworkDefinition = config.framework
    ? frameworksBySlug.get(config.framework)
    : undefined;

  if (hasCommand) {
    if (!inferredRuntime) {
      throw new Error(
        `Could not infer runtime for command-backed service "${name}".`
      );
    }
    builderUse = getBuilderForRuntime(inferredRuntime);
    builderSrc = '<detect>';
  } else if (config.builder) {
    builderUse = config.builder;
    builderSrc =
      resolvedEntrypointFile ||
      frameworkDefinition?.useRuntime?.src ||
      'package.json';
  } else if (config.framework) {
    if (type === 'web' && isNodeBackendFramework(config.framework)) {
      builderUse = '@vercel/backends';
    } else {
      builderUse =
        frameworkDefinition?.useRuntime?.use || '@vercel/static-build';
    }
    // Prefer user-provided entrypoint over framework default
    builderSrc =
      resolvedEntrypointFile ||
      frameworkDefinition?.useRuntime?.src ||
      'package.json';
  } else {
    if (!inferredRuntime) {
      throw new Error(
        `Could not infer runtime for service "${name}" and no builder or framework were provided.`
      );
    }
    if (inferredRuntime === 'node') {
      builderUse = type === 'web' ? '@vercel/backends' : '@vercel/node';
    } else {
      builderUse = getBuilderForRuntime(inferredRuntime);
    }
    builderSrc = resolvedEntrypointFile!;
  }

  const normalizedSubdomain =
    type === 'web' && typeof config.subdomain === 'string'
      ? config.subdomain.toLowerCase()
      : undefined;
  const defaultRoutePrefix =
    type === 'web' && normalizedSubdomain ? `/_/${name}` : undefined;
  // routePrefix defaults to /_/serviceName for subdomain-mounted web services.
  const routePrefix =
    type === 'web' && (config.routePrefix || defaultRoutePrefix)
      ? (config.routePrefix || defaultRoutePrefix)!.startsWith('/')
        ? (config.routePrefix || defaultRoutePrefix)!
        : `/${config.routePrefix || defaultRoutePrefix}`
      : undefined;
  const resolvedRoutePrefixSource =
    type === 'web' && typeof routePrefix === 'string'
      ? config.routePrefix
        ? routePrefixSource
        : 'generated'
      : undefined;

  // Ensure builder.src is fully qualified for non-root workspaces.
  // Always prepend — by this point, file entrypoints are workspace-relative.
  const isRoot = workspace === '.';
  if (!isRoot) {
    builderSrc = posixPath.join(workspace, builderSrc);
  }

  // Services are built via the zero-config pipeline (multiple builders, merged routes).
  // Ensure `zeroConfig` is set on the Builder spec so downstream steps (like
  // CLI `writeBuildResultV3()`) can compute correct extensionless function paths.
  const builderConfig: Record<string, unknown> = { zeroConfig: true };
  if (builderUse === '@vercel/backends') {
    builderConfig.serviceName = name;
  }
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
  // Pass workspace to builder config for builders that need to know the service's workspace
  if (workspace && workspace !== '.') {
    builderConfig.workspace = workspace;
  }
  if (config.framework) {
    builderConfig.framework = config.framework;
  }
  if (hasCommand) {
    builderConfig.command = rawCommand;
  }
  if (moduleAttrParsed) {
    builderConfig.handlerFunction = moduleAttrParsed.attrName;
  }

  return {
    name,
    type,
    group,
    workspace,
    entrypoint: resolvedEntrypointFile,
    routePrefix,
    routePrefixSource: resolvedRoutePrefixSource,
    subdomain: normalizedSubdomain,
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
    command: rawCommand,
    handlerFunction: moduleAttrParsed?.attrName,
    topics,
    consumer,
    envPrefix: config.envPrefix,
  };
}

/**
 * Resolve all services from vercel.json experimentalServices.
 * Validates each service configuration.
 */
export async function resolveAllConfiguredServices(
  services: ExperimentalServices,
  fs: DetectorFilesystem,
  routePrefixSource: RoutePrefixSource = 'configured'
): Promise<{
  services: Service[];
  errors: ServiceDetectionError[];
}> {
  const resolved: Service[] = [];
  const errors: ServiceDetectionError[] = [];
  const webServicesByRoutePrefix = new Map<string, string>();

  for (const name of Object.keys(services)) {
    const serviceConfig = services[name];

    const validationError = validateServiceConfig(name, serviceConfig);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    let resolvedEntrypoint: ResolvedEntrypointPath | undefined;
    const serviceType = serviceConfig.type || 'web';
    if (typeof serviceConfig.entrypoint === 'string') {
      const moduleAttr =
        serviceType === 'cron'
          ? parsePyModuleAttrEntrypoint(serviceConfig.entrypoint)
          : null;
      const entrypointToResolve = moduleAttr
        ? moduleAttr.filePath
        : serviceConfig.entrypoint;
      const resolvedPath = await resolveEntrypointPath({
        fs,
        serviceName: name,
        entrypoint: entrypointToResolve,
      });
      if (resolvedPath.error) {
        errors.push(resolvedPath.error);
        continue;
      }
      resolvedEntrypoint = resolvedPath.entrypoint;
    }

    if (resolvedEntrypoint) {
      const entrypointError = validateServiceEntrypoint(
        name,
        serviceConfig,
        resolvedEntrypoint
      );
      if (entrypointError) {
        errors.push(entrypointError);
        continue;
      }
    }

    let resolvedConfig = serviceConfig;
    if (!serviceConfig.framework && resolvedEntrypoint) {
      if (resolvedEntrypoint.isDirectory) {
        const inferredRuntime = inferServiceRuntime({
          ...serviceConfig,
        });
        const workspace = resolvedEntrypoint.normalized;
        const { framework, error } = await detectFrameworkFromWorkspace({
          fs,
          workspace,
          runtime: inferredRuntime,
          serviceName: name,
        });
        if (error) {
          errors.push(error);
          continue;
        }
        if (!framework) {
          errors.push({
            code: 'MISSING_SERVICE_FRAMEWORK',
            message: `Service "${name}" uses directory entrypoint "${serviceConfig.entrypoint}" but no framework could be detected in "${workspace}". Specify "framework" explicitly or use a file entrypoint.`,
            serviceName: name,
          });
          continue;
        }
        resolvedConfig = {
          ...resolvedConfig,
          framework,
        };
      } else {
        const inferredRuntime = inferServiceRuntime({
          ...serviceConfig,
          entrypoint: resolvedEntrypoint.normalized,
        });

        if (inferredRuntime) {
          const inferredWorkspace = await inferWorkspaceFromNearestManifest({
            fs,
            entrypoint: resolvedEntrypoint.normalized,
            runtime: inferredRuntime,
          });
          const workspace =
            inferredWorkspace ??
            posixPath.dirname(resolvedEntrypoint.normalized);
          const detection = await detectFrameworkFromWorkspace({
            fs,
            workspace,
            serviceName: name,
            runtime: inferredRuntime,
          });
          if (!detection.error && detection.framework) {
            resolvedConfig = {
              ...resolvedConfig,
              framework: detection.framework,
            };
          }
        }
      }
    }

    const service = await resolveConfiguredService({
      name,
      config: resolvedConfig,
      fs,
      resolvedEntrypoint,
      routePrefixSource,
    });

    if (service.type === 'web' && typeof service.routePrefix === 'string') {
      const normalizedRoutePrefix = normalizeRoutePrefix(service.routePrefix);
      const existingServiceName = webServicesByRoutePrefix.get(
        normalizedRoutePrefix
      );
      if (existingServiceName) {
        errors.push({
          code: 'DUPLICATE_ROUTE_PREFIX',
          message: `Web services "${existingServiceName}" and "${name}" cannot share routePrefix "${normalizedRoutePrefix}".`,
          serviceName: name,
        });
        continue;
      }
      webServicesByRoutePrefix.set(normalizedRoutePrefix, name);
    }

    resolved.push(service);
  }

  return { services: resolved, errors };
}
