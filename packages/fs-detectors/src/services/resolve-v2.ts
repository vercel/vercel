import { posix as posixPath } from 'path';
import { isNodeBackendFramework } from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import type {
  ExperimentalServiceV2,
  ExperimentalServiceV2Config,
  ExperimentalServiceV2Mount,
  ExperimentalServicesV2,
  ServiceDetectionError,
  ServiceRuntime,
} from './types';
import { RUNTIME_BUILDERS, STATIC_BUILDERS } from './types';
import {
  getServiceFs,
  resolveEntrypointPath,
  detectFrameworkFromWorkspace,
  parsePyModuleAttrEntrypoint,
} from './resolve';
import {
  getBuilderForRuntime,
  inferRuntimeFromFramework,
  inferServiceRuntime,
} from './utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

const SERVICE_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;

// Lowercase DNS labels, optionally dotted (e.g. "api", "api.v1").
const MOUNT_SUBDOMAIN_REGEX =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

// Mount paths are literal path segments; reject regex/path-to-regexp
// metacharacters, whitespace, and empty segments.
const MOUNT_PATH_META_REGEX = /[:*?+()[\]{}^$|\\\s]/;

type NormalizedMount =
  | { kind: 'path'; routes: string[]; stripPrefix?: string }
  | { kind: 'subdomain'; subdomain: string };

/** Trim trailing slash so `/api/` and `/api` mount the same path. */
function normalizeMountPath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Normalize a structurally valid `mount` into its canonical form.
 * Returns null if the value does not match any of the supported shapes.
 */
function normalizeMount(
  mount: ExperimentalServiceV2Mount
): NormalizedMount | null {
  if (typeof mount === 'string') {
    return { kind: 'path', routes: [normalizeMountPath(mount)] };
  }
  if (!mount || typeof mount !== 'object' || Array.isArray(mount)) {
    return null;
  }
  const keys = Object.keys(mount);
  if ('subdomain' in mount) {
    if (keys.length !== 1 || typeof mount.subdomain !== 'string') {
      return null;
    }
    return { kind: 'subdomain', subdomain: mount.subdomain };
  }
  if ('routes' in mount) {
    if (
      !Array.isArray(mount.routes) ||
      mount.routes.length === 0 ||
      mount.routes.some(route => typeof route !== 'string') ||
      (mount.stripPrefix !== undefined &&
        typeof mount.stripPrefix !== 'string') ||
      keys.some(key => key !== 'routes' && key !== 'stripPrefix')
    ) {
      return null;
    }
    return {
      kind: 'path',
      routes: mount.routes.map(normalizeMountPath),
      stripPrefix:
        mount.stripPrefix === undefined
          ? undefined
          : normalizeMountPath(mount.stripPrefix),
    };
  }
  return null;
}

function isInvalidMountPath(path: string): boolean {
  return (
    !path.startsWith('/') ||
    path.includes('//') ||
    MOUNT_PATH_META_REGEX.test(path)
  );
}

/** True when `prefix` is `path` itself or a path-segment prefix of it. */
function isSegmentPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function validateServiceMount(
  name: string,
  mount: ExperimentalServiceV2Mount
): ServiceDetectionError | null {
  const normalized = normalizeMount(mount);
  if (!normalized) {
    return {
      code: 'INVALID_SERVICE_MOUNT',
      message:
        `Service "${name}" has an invalid "mount". Use a path string such as "/api", ` +
        `an object like { routes: ["/api"], stripPrefix: "/api" }, or { subdomain: "api" }.`,
      serviceName: name,
    };
  }

  if (normalized.kind === 'subdomain') {
    if (
      normalized.subdomain.length > 253 ||
      !MOUNT_SUBDOMAIN_REGEX.test(normalized.subdomain)
    ) {
      return {
        code: 'INVALID_SERVICE_MOUNT',
        message:
          `Service "${name}" has an invalid "mount.subdomain" "${normalized.subdomain}". ` +
          `Use lowercase DNS labels such as "api" or "api.v1".`,
        serviceName: name,
      };
    }
    return null;
  }

  for (const path of [...normalized.routes, normalized.stripPrefix ?? '/']) {
    if (isInvalidMountPath(path)) {
      return {
        code: 'INVALID_SERVICE_MOUNT_PATH',
        message:
          `Service "${name}" has an invalid mount path "${path}". Mount paths are literal ` +
          `"/"-prefixed path segments, not patterns. For pattern matching, use "rewrites" instead.`,
        serviceName: name,
      };
    }
  }

  const { stripPrefix } = normalized;
  if (stripPrefix !== undefined && stripPrefix !== '/') {
    for (const route of normalized.routes) {
      if (!isSegmentPrefix(stripPrefix, route)) {
        return {
          code: 'INVALID_MOUNT_STRIP_PREFIX',
          message:
            `Service "${name}" has "mount.stripPrefix" "${stripPrefix}" which is not a ` +
            `path-segment prefix of mount route "${route}". Every route must start with the stripped prefix.`,
          serviceName: name,
        };
      }
    }
  }

  return null;
}

/**
 * Validate that mounts do not overlap across (or within) services.
 *
 * Mounts are order-independent, so any two routes where one equals or
 * segment-prefixes the other are ambiguous — except the root mount `/`,
 * which is the only allowed fallback.
 */
export function validateServiceMountConflicts(
  services: ExperimentalServicesV2
): ServiceDetectionError[] {
  const errors: ServiceDetectionError[] = [];
  const pathMounts: Array<{ serviceName: string; route: string }> = [];
  const subdomains = new Map<string, string>();
  let rootService: string | undefined;

  for (const [serviceName, config] of Object.entries(services)) {
    if (config?.mount === undefined) {
      continue;
    }
    const normalized = normalizeMount(config.mount);
    // Shape/path errors are reported per-service by `validateServiceMount`.
    if (!normalized || validateServiceMount(serviceName, config.mount)) {
      continue;
    }

    if (normalized.kind === 'subdomain') {
      const existing = subdomains.get(normalized.subdomain);
      if (existing) {
        errors.push({
          code: 'DUPLICATE_SERVICE_SUBDOMAIN',
          message: `Services "${existing}" and "${serviceName}" are both mounted on subdomain "${normalized.subdomain}". Each subdomain can route to only one service.`,
          serviceName,
        });
      } else {
        subdomains.set(normalized.subdomain, serviceName);
      }
      continue;
    }

    for (const route of normalized.routes) {
      if (route === '/') {
        if (rootService) {
          errors.push({
            code: 'CONFLICTING_SERVICE_MOUNTS',
            message: `Services "${rootService}" and "${serviceName}" are both mounted on "/". Only one service can own the root path.`,
            serviceName,
          });
        } else {
          rootService = serviceName;
        }
        continue;
      }
      const conflict = pathMounts.find(
        existing =>
          isSegmentPrefix(existing.route, route) ||
          isSegmentPrefix(route, existing.route)
      );
      if (conflict) {
        errors.push({
          code: 'CONFLICTING_SERVICE_MOUNTS',
          message:
            `Mount routes "${conflict.route}" (service "${conflict.serviceName}") and "${route}" ` +
            `(service "${serviceName}") overlap. Mounts are order-independent and must not overlap. ` +
            `For fallback routing, use explicit "rewrites" instead.`,
          serviceName,
        });
      } else {
        pathMounts.push({ serviceName, route });
      }
    }
  }

  return errors;
}

export function validateServiceConfigV2(
  name: string,
  config: ExperimentalServiceV2Config
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
  if (typeof config.root !== 'string' || config.root.length === 0) {
    return {
      code: 'MISSING_ROOT',
      message: `Service "${name}" must specify a "root".`,
      serviceName: name,
    };
  }
  const normalizedRoot = posixPath.normalize(config.root);
  if (normalizedRoot.startsWith('/')) {
    return {
      code: 'INVALID_ROOT',
      message: `Service "${name}" has invalid "root" "${config.root}". Must be a relative path.`,
      serviceName: name,
    };
  }
  if (normalizedRoot === '..' || normalizedRoot.startsWith('../')) {
    return {
      code: 'INVALID_ROOT',
      message: `Service "${name}" has invalid "root" "${config.root}". Must not escape the project root.`,
      serviceName: name,
    };
  }
  if (config.mount !== undefined) {
    const mountError = validateServiceMount(name, config.mount);
    if (mountError) {
      return mountError;
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
        message:
          `Service "${name}" has conflicting runtime/framework: runtime "${config.runtime}" is incompatible ` +
          `with framework "${config.framework}" (runtime "${frameworkRuntime}").`,
        serviceName: name,
      };
    }
  }
  if (!config.framework && !config.entrypoint) {
    return {
      code: 'MISSING_SERVICE_CONFIG',
      message: `Service "${name}" must specify "framework" or "entrypoint".`,
      serviceName: name,
    };
  }
  return null;
}

export async function resolveConfiguredServiceV2(
  name: string,
  config: ExperimentalServiceV2Config,
  fs: DetectorFilesystem
): Promise<{ service?: ExperimentalServiceV2; error?: ServiceDetectionError }> {
  const root = config.root;
  const normalizedRoot = posixPath.normalize(root);

  // Scope the filesystem to the service root for entrypoint/framework detection.
  // A root of "." is the project root itself, so there is nothing to chdir into.
  const serviceFsResult =
    normalizedRoot === '.' ? { fs } : await getServiceFs(fs, name, root);
  if (serviceFsResult.error) {
    return { error: serviceFsResult.error };
  }
  const serviceFs = serviceFsResult.fs;

  // Resolve the entrypoint, Python `module:attr` references
  // resolve against their underlying file.
  const rawEntrypoint = config.entrypoint;
  const moduleAttr =
    typeof rawEntrypoint === 'string'
      ? parsePyModuleAttrEntrypoint(rawEntrypoint)
      : null;
  let normalizedEntrypoint: string | undefined;
  let entrypointIsDirectory = false;
  if (typeof rawEntrypoint === 'string') {
    const entrypointToResolve = moduleAttr
      ? moduleAttr.filePath
      : rawEntrypoint;
    const resolved = await resolveEntrypointPath({
      fs: serviceFs,
      serviceName: name,
      entrypoint: entrypointToResolve,
    });
    if (resolved.error) {
      return { error: resolved.error };
    }
    normalizedEntrypoint = resolved.entrypoint?.normalized;
    entrypointIsDirectory = Boolean(resolved.entrypoint?.isDirectory);
  }

  const entrypointFile =
    entrypointIsDirectory || !normalizedEntrypoint
      ? undefined
      : normalizedEntrypoint;

  const inferredRuntime = inferServiceRuntime({
    runtime: config.runtime,
    framework: config.framework,
    entrypoint: entrypointFile,
  });

  let framework = config.framework;
  if (!framework && normalizedEntrypoint) {
    const workspace = entrypointIsDirectory
      ? normalizedEntrypoint
      : posixPath.dirname(normalizedEntrypoint) || '.';
    const detection = await detectFrameworkFromWorkspace({
      fs: serviceFs,
      workspace,
      serviceName: name,
      runtime: inferredRuntime,
    });
    if (detection.error) {
      return { error: detection.error };
    }
    framework = detection.framework;
  }

  if (entrypointIsDirectory && !framework) {
    return {
      error: {
        code: 'MISSING_SERVICE_FRAMEWORK',
        message:
          `Service "${name}" uses directory entrypoint "${config.entrypoint}" but no framework could be detected. ` +
          `Specify "framework" explicitly or use a file entrypoint.`,
        serviceName: name,
      },
    };
  }

  const frameworkDefinition = framework
    ? frameworksBySlug.get(framework)
    : undefined;
  let builderUse: string;
  let builderSrc: string;
  if (framework) {
    builderUse = isNodeBackendFramework(framework)
      ? '@vercel/backends'
      : frameworkDefinition?.useRuntime?.use || '@vercel/static-build';
    builderSrc =
      entrypointFile || frameworkDefinition?.useRuntime?.src || 'package.json';
  } else {
    if (!inferredRuntime) {
      return {
        error: {
          code: 'MISSING_SERVICE_CONFIG',
          message: `Service "${name}" must specify "framework" or a runtime-resolvable "entrypoint".`,
          serviceName: name,
        },
      };
    }
    builderUse =
      inferredRuntime === 'node'
        ? '@vercel/backends'
        : getBuilderForRuntime(inferredRuntime as ServiceRuntime);
    builderSrc = entrypointFile as string;
  }

  // builder.src must be project-root-relative.
  const isRoot = normalizedRoot === '.';
  const projectRelativeSrc = isRoot
    ? builderSrc
    : posixPath.join(normalizedRoot, builderSrc);

  // Services are built via the zero-config pipeline (multiple builders, merged routes).
  // Ensure `zeroConfig` is set on the Builder spec so downstream steps (like
  // CLI `writeBuildResultV3()`) can compute correct extensionless function paths.
  const builderConfig: Record<string, unknown> = { zeroConfig: true };
  if (builderUse === '@vercel/backends') {
    builderConfig.serviceName = name;
  }
  if (framework) {
    builderConfig.framework = framework;
  }
  if (!isRoot) {
    builderConfig.workspace = normalizedRoot;
  }
  if (moduleAttr) {
    builderConfig.handlerFunction = moduleAttr.attrName;
  }

  const runtime = STATIC_BUILDERS.has(builderUse) ? undefined : inferredRuntime;

  return {
    service: {
      schema: 'experimentalServicesV2',
      name,
      root,
      framework,
      runtime,
      entrypoint: entrypointFile,
      mount: config.mount,
      builder: {
        src: projectRelativeSrc,
        use: builderUse,
        config: builderConfig,
      },
      installCommand: config.installCommand,
      buildCommand: config.buildCommand,
      devCommand: config.devCommand,
      ignoreCommand: config.ignoreCommand,
      outputDirectory: config.outputDirectory,
      bindings: config.bindings,
      functions: config.functions,
      headers: config.headers,
      redirects: config.redirects,
      rewrites: config.rewrites,
      routes: config.routes,
      cleanUrls: config.cleanUrls,
      trailingSlash: config.trailingSlash,
    },
  };
}

export async function resolveAllConfiguredServicesV2(
  services: ExperimentalServicesV2,
  fs: DetectorFilesystem
): Promise<{
  services: ExperimentalServiceV2[];
  errors: ServiceDetectionError[];
}> {
  const resolved: ExperimentalServiceV2[] = [];
  const errors: ServiceDetectionError[] = [];

  for (const name of Object.keys(services)) {
    const config = services[name];

    const validationError = validateServiceConfigV2(name, config);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    const { service, error } = await resolveConfiguredServiceV2(
      name,
      config,
      fs
    );
    if (error) {
      errors.push(error);
      continue;
    }
    if (service) {
      resolved.push(service);
    }
  }

  // every binding must reference a declared service.
  const serviceNames = new Set(Object.keys(services));
  for (const service of resolved) {
    for (const binding of service.bindings ?? []) {
      if (!serviceNames.has(binding.service)) {
        errors.push({
          code: 'UNKNOWN_SERVICE_BINDING',
          message: `Service "${service.name}" declares a binding to unknown service "${binding.service}".`,
          serviceName: service.name,
        });
      }
    }
  }

  errors.push(...validateServiceMountConflicts(services));

  return { services: resolved, errors };
}
