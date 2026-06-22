import { posix as posixPath } from 'path';
import { isNodeBackendFramework } from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import type {
  ExperimentalServiceV2,
  ExperimentalServiceV2Config,
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
  stripTrailingSlash,
} from './utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

const SERVICE_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;

/**
 * A container entrypoint pointing at a Dockerfile/Containerfile is built &
 * pushed; anything else (or `config.image`) is a prebuilt image reference.
 */
function isDockerfileEntrypoint(entrypoint: string): boolean {
  const base = posixPath.basename(entrypoint).toLowerCase();
  return (
    base === 'dockerfile' ||
    base === 'containerfile' ||
    base.endsWith('.dockerfile')
  );
}

function normalizeContainerCommand(
  command: string | string[] | undefined
): string[] | undefined {
  if (command === undefined) {
    return undefined;
  }
  return Array.isArray(command) ? command : [command];
}

/**
 * Resolve a container (`runtime: "container"`) service. Containers don't go
 * through framework/entrypoint-extension detection: the entrypoint is either a
 * Dockerfile to build & push or a prebuilt OCI image reference (also settable
 * via `config.image`).
 */
function resolveContainerServiceV2(
  name: string,
  config: ExperimentalServiceV2Config
): { service?: ExperimentalServiceV2; error?: ServiceDetectionError } {
  const root = config.root;
  const normalizedRoot = posixPath.normalize(root);
  const isRoot = normalizedRoot === '.';

  const entrypoint = config.entrypoint;
  const dockerfile =
    typeof entrypoint === 'string' && isDockerfileEntrypoint(entrypoint)
      ? posixPath.normalize(entrypoint)
      : undefined;
  // Prebuilt image: explicit `config.image`, or a non-Dockerfile entrypoint.
  const image =
    config.image ??
    (typeof entrypoint === 'string' && !dockerfile ? entrypoint : undefined);

  if (!dockerfile && !image) {
    return {
      error: {
        code: 'MISSING_SERVICE_CONFIG',
        message: `Container service "${name}" must specify a Dockerfile "entrypoint" to build, or a prebuilt "image".`,
        serviceName: name,
      },
    };
  }

  // builder.src is project-root-relative. For a prebuilt image there is no
  // source file, so default to a Dockerfile path under the root (the builder
  // treats a missing Dockerfile + configured image as prebuilt).
  const localSrc = dockerfile ?? image ?? 'Dockerfile';
  const builderSrc = isRoot
    ? localSrc
    : posixPath.join(normalizedRoot, localSrc);

  const builderConfig: Record<string, unknown> = { zeroConfig: true };
  if (!isRoot) {
    builderConfig.workspace = normalizedRoot;
  }
  if (image) {
    builderConfig.image = image;
  }
  const command = normalizeContainerCommand(config.command);
  if (command) {
    builderConfig.command = command;
  }

  return {
    service: {
      schema: 'experimentalServicesV2',
      name,
      root,
      runtime: 'container',
      entrypoint: image ?? dockerfile,
      command,
      builder: {
        src: builderSrc,
        use: '@vercel/container',
        config: builderConfig,
      },
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
  // Container services may specify a prebuilt `image` instead of a framework or
  // entrypoint.
  const isContainer =
    config.runtime === 'container' || config.image !== undefined;
  if (!config.framework && !config.entrypoint && !isContainer) {
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
  // `posixPath.normalize` preserves trailing slashes ("frontend/" stays
  // "frontend/"), which double-prefixes builder paths downstream. Strip it so
  // "frontend/" and "frontend" resolve identically.
  const normalizedRoot = stripTrailingSlash(posixPath.normalize(config.root));

  // Container services are resolved separately: they don't go through
  // framework/entrypoint-extension detection. Container intent is signalled by
  // an explicit `runtime: "container"`, a Dockerfile entrypoint, or a prebuilt
  // `image`.
  const isContainer =
    config.runtime === 'container' ||
    config.image !== undefined ||
    (typeof config.entrypoint === 'string' &&
      isDockerfileEntrypoint(config.entrypoint));
  if (isContainer) {
    return resolveContainerServiceV2(name, config);
  }

  // Scope the filesystem to the service root for entrypoint/framework detection.
  // A root of "." is the project root itself, so there is nothing to chdir into.
  const serviceFsResult =
    normalizedRoot === '.'
      ? { fs }
      : await getServiceFs(fs, name, normalizedRoot);
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
      root: normalizedRoot,
      framework,
      runtime,
      entrypoint: entrypointFile,
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

  return { services: resolved, errors };
}
