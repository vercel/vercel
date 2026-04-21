import { posix as posixPath } from 'path';
import type {
  Service,
  ExperimentalServiceConfig,
  ExperimentalServices,
  ResolvedEntrypointPath,
  ServiceDetectionError,
  ServiceRuntime,
} from './types';
import { getServiceQueueTopics } from '@vercel/build-utils';
import { STATIC_BUILDERS, RUNTIME_MANIFESTS } from './types';
import {
  filterFrameworksByRuntime,
  getBuilderForRuntime,
  hasFile,
  inferServiceRuntime,
} from './utils';
import { frameworkList } from '@vercel/frameworks';
import { detectFrameworks } from '../detect-framework';
import type { DetectorFilesystem } from '../detectors/filesystem';
import { normalizeRoutePrefix } from '@vercel/routing-utils';
import { isNodeBackendFramework } from '@vercel/build-utils';
import {
  validateResolvedServiceRoutingSupport,
  validateServiceConfig,
  validateServiceConfigShape,
  validateServiceName,
  validateServiceEntrypoint,
} from './validation';
import {
  resolveServiceRoutingConfig,
  type ResolvedServiceRoutingConfig,
} from './routing';

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

async function getServiceFs(
  fs: DetectorFilesystem,
  serviceName: string,
  root?: string
): Promise<{
  fs: DetectorFilesystem;
  error?: ServiceDetectionError;
}> {
  if (!root) {
    return { fs };
  }
  const normalizedRoot = posixPath.normalize(root);
  if (!(await fs.hasPath(normalizedRoot))) {
    return {
      fs,
      error: {
        code: 'ROOT_NOT_FOUND',
        message: `Service "${serviceName}" has root "${root}" but that directory does not exist.`,
        serviceName,
      },
    };
  }
  if (await fs.isFile(normalizedRoot)) {
    return {
      fs,
      error: {
        code: 'ROOT_NOT_DIRECTORY',
        message: `Service "${serviceName}" has root "${root}" but that path is a file, not a directory.`,
        serviceName,
      },
    };
  }
  return { fs: fs.chdir(normalizedRoot) };
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
  routingConfig: ResolvedServiceRoutingConfig;
  /** Filesystem scoped to the service root (via chdir) when root is set, otherwise the project-level fs. */
  serviceFs: DetectorFilesystem;
  root?: string;
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

/**
 * Resolve a single service from user configuration.
 */
export async function resolveConfiguredService(
  options: ResolveConfiguredServiceOptions
): Promise<Service> {
  const {
    name,
    config,
    routingConfig,
    serviceFs,
    root,
    group,
    resolvedEntrypoint,
    routePrefixSource = 'configured',
  } = options;
  const type = config.type || 'web';
  const trigger =
    type === 'cron' ? 'schedule' : type === 'job' ? config.trigger : undefined;
  const rawEntrypoint = config.entrypoint;

  const moduleAttrParsed =
    typeof rawEntrypoint === 'string'
      ? parsePyModuleAttrEntrypoint(rawEntrypoint)
      : null;
  const configuredRoutePrefix = routingConfig.routePrefix;
  const configuredSubdomain = routingConfig.subdomain;
  const configuredRoutingPaths = routingConfig.routingPaths;
  const routePrefixWasConfigured = routingConfig.routePrefixConfigured;

  let resolvedEntrypointPath = resolvedEntrypoint;
  if (!resolvedEntrypointPath && typeof rawEntrypoint === 'string') {
    const entrypointToResolve = moduleAttrParsed
      ? moduleAttrParsed.filePath
      : rawEntrypoint;
    const resolved = await resolveEntrypointPath({
      fs: serviceFs,
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

  // Directory entrypoints define the service workspace directly.
  if (entrypointIsDirectory && normalizedEntrypoint) {
    workspace = normalizedEntrypoint;
  } else {
    // File entrypoints infer workspace from nearest runtime manifest.
    const inferredWorkspace = await inferWorkspaceFromNearestManifest({
      fs: serviceFs,
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

  // When root is provided, prefix workspace to make it project-root-relative.
  if (root) {
    const normalizedRoot = posixPath.normalize(root);
    if (normalizedRoot !== '.') {
      workspace =
        workspace === '.'
          ? normalizedRoot
          : posixPath.join(normalizedRoot, workspace);
    }
  }

  const topics =
    type === 'worker'
      ? getServiceQueueTopics({ type, topics: config.topics })
      : trigger === 'queue'
        ? config.topics
        : undefined;

  let builderUse: string;
  let builderSrc: string;

  const frameworkDefinition = config.framework
    ? frameworksBySlug.get(config.framework)
    : undefined;

  if (config.builder) {
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
    type === 'web' && typeof configuredSubdomain === 'string'
      ? configuredSubdomain.toLowerCase()
      : undefined;
  const defaultRoutePrefix =
    type === 'web' && normalizedSubdomain ? `/_/${name}` : undefined;
  // routePrefix defaults to /_/serviceName for subdomain-mounted web services.
  const routePrefix =
    type === 'web' && (configuredRoutePrefix || defaultRoutePrefix)
      ? (configuredRoutePrefix || defaultRoutePrefix)!.startsWith('/')
        ? (configuredRoutePrefix || defaultRoutePrefix)!
        : `/${configuredRoutePrefix || defaultRoutePrefix}`
      : undefined;
  const resolvedRoutePrefixSource =
    type === 'web' && typeof routePrefix === 'string'
      ? routePrefixWasConfigured
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

  const stripRoutePrefix =
    type === 'web' && typeof routePrefix === 'string' && routePrefix !== '/';

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
  if (moduleAttrParsed) {
    builderConfig.handlerFunction = moduleAttrParsed.attrName;
  }

  return {
    name,
    type,
    trigger,
    group,
    workspace,
    entrypoint: resolvedEntrypointFile,
    routePrefix,
    routePrefixSource: resolvedRoutePrefixSource,
    routingPaths: configuredRoutingPaths,
    stripRoutePrefix,
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
    handlerFunction: moduleAttrParsed?.attrName,
    topics,
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
  const webServicesByOwnedPath = new Map<string, string>();

  for (const name of Object.keys(services)) {
    const serviceConfig = services[name];

    const nameError = validateServiceName(name);
    if (nameError) {
      errors.push(nameError);
      continue;
    }

    const shapeError = validateServiceConfigShape(name, serviceConfig);
    if (shapeError) {
      errors.push(shapeError);
      continue;
    }

    const routingResult = resolveServiceRoutingConfig(name, serviceConfig);
    if ('error' in routingResult) {
      errors.push(routingResult.error);
      continue;
    }

    const routingConfig = routingResult.routing;
    const validationError = validateServiceConfig(
      name,
      serviceConfig,
      routingConfig
    );
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    // Scope filesystem to root if specified
    const root = serviceConfig.root;
    const serviceFsResult = await getServiceFs(fs, name, root);
    if (serviceFsResult.error) {
      errors.push(serviceFsResult.error);
      continue;
    }
    const serviceFs = serviceFsResult.fs;

    let resolvedEntrypoint: ResolvedEntrypointPath | undefined;
    if (typeof serviceConfig.entrypoint === 'string') {
      const moduleAttr = parsePyModuleAttrEntrypoint(serviceConfig.entrypoint);
      const entrypointToResolve =
        moduleAttr?.filePath ?? serviceConfig.entrypoint;
      const resolvedPath = await resolveEntrypointPath({
        fs: serviceFs,
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
          fs: serviceFs,
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
            fs: serviceFs,
            entrypoint: resolvedEntrypoint.normalized,
            runtime: inferredRuntime,
          });
          const workspace =
            inferredWorkspace ??
            posixPath.dirname(resolvedEntrypoint.normalized);
          const detection = await detectFrameworkFromWorkspace({
            fs: serviceFs,
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
      routingConfig,
      serviceFs,
      root,
      resolvedEntrypoint,
      routePrefixSource,
    });

    const resolvedRoutingError = validateResolvedServiceRoutingSupport(service);
    if (resolvedRoutingError) {
      errors.push(resolvedRoutingError);
      continue;
    }

    if (service.type === 'web') {
      const ownedPaths = service.routingPaths?.length
        ? service.routingPaths
        : typeof service.routePrefix === 'string'
          ? [service.routePrefix]
          : [];

      let hasDuplicateOwnedPath = false;
      for (const ownedPath of ownedPaths) {
        const normalizedOwnedPath = normalizeRoutePrefix(ownedPath);
        const existingServiceName =
          webServicesByOwnedPath.get(normalizedOwnedPath);
        if (existingServiceName) {
          errors.push({
            code: 'DUPLICATE_ROUTE_PREFIX',
            message: `Web services "${existingServiceName}" and "${name}" cannot share routing path "${normalizedOwnedPath}".`,
            serviceName: name,
          });
          hasDuplicateOwnedPath = true;
          break;
        }
      }
      if (hasDuplicateOwnedPath) {
        continue;
      }
      for (const ownedPath of ownedPaths) {
        webServicesByOwnedPath.set(normalizeRoutePrefix(ownedPath), name);
      }
    }

    resolved.push(service);
  }

  return { services: resolved, errors };
}
