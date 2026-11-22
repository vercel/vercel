import { posix as posixPath } from 'path';
import type { HasField, Rewrite } from '@vercel/routing-utils';
import type {
  BuilderFunctions,
  ExperimentalService,
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceBinding,
  ServiceConfig,
  Services,
} from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import type { DetectorFilesystem } from '../detectors/filesystem';
import { RUNTIME_BUILDERS } from './runtimes/constants';
import { resolveAllConfiguredServices } from './resolve';
import { resolveAllConfiguredServicesV2 } from './resolve-v2';
import type { ServiceDetectionError } from './types';
import { combineBuildCommand, isStaticBuild, readVercelConfig } from './utils';

const SERVICES_DOCS_URL = 'https://vercel.com/docs/services';
const SERVICES_ROUTING_DOCS_URL = 'https://vercel.com/docs/services/routing';
const SERVICES_BINDINGS_DOCS_URL = 'https://vercel.com/docs/services/bindings';
const EXPERIMENTAL_SERVICES_DOCS_URL =
  'https://vercel.com/docs/services/experimental';

/** Top-level build settings that are not allowed alongside `services`. */
const TOP_LEVEL_BUILD_KEYS = [
  'functions',
  'installCommand',
  'buildCommand',
  'devCommand',
  'ignoreCommand',
  'outputDirectory',
  'framework',
] as const;

type TopLevelBuildKey = (typeof TOP_LEVEL_BUILD_KEYS)[number];

// Subdomain routing was never applied on preview URLs.
const PREVIEW_DOMAIN_MISSING: HasField = [
  { type: 'host', value: { suf: '.vercel.app' } },
  { type: 'host', value: { suf: '.vercel.dev' } },
];

export interface ServicesMigrationNote {
  code: string;
  message: string;
  serviceName?: string;
  link?: string;
}

/** Config fields read by the migration; callers retain other fields. */
export interface LegacyServicesConfig {
  experimentalServices?: ExperimentalServices;
  experimentalServiceGroups?: ExperimentalServiceGroups;
  experimentalServicesV2?: Services;
  services?: Services;
  build?: { env?: Record<string, string> };
  rewrites?: Rewrite[];
  functions?: BuilderFunctions;
  installCommand?: string | null;
  buildCommand?: string | null;
  devCommand?: string | null;
  ignoreCommand?: string | null;
  outputDirectory?: string | null;
  framework?: string | null;
}

export interface ExperimentalServicesMigrationPlan {
  patch: {
    services: Services;
    /** Append these after existing top-level rewrites. */
    rewrites: Rewrite[];
    /** Public URL defaults to merge into build.env, without replacing existing values. */
    build?: { env: Record<string, string> };
  };
  removeKeys: string[];
  movedTopLevelKeys: Array<{ key: TopLevelBuildKey; service: string }>;
  renamedServices: Array<{ from: string; to: string }>;
  warnings: ServicesMigrationNote[];
  unmigrated: ServicesMigrationNote[];
  /** Blocking problems. A plan with errors must not be applied. */
  errors: ServiceDetectionError[];
}

export function hasLegacyServicesConfig(
  config: LegacyServicesConfig | null | undefined
): boolean {
  return (
    isNonEmptyObject(config?.experimentalServices) ||
    isNonEmptyObject(config?.experimentalServicesV2)
  );
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function getServicesConfigConflict(
  config: LegacyServicesConfig
): ServiceDetectionError | undefined {
  const keys = (
    ['services', 'experimentalServices', 'experimentalServicesV2'] as const
  ).filter(key => config[key] !== undefined);
  if (keys.length > 1) {
    return {
      code: 'CONFLICTING_SERVICES_CONFIG',
      message: `Cannot migrate a configuration containing ${keys.map(key => `\`${key}\``).join(' and ')}. Keep only the configuration you intend to migrate; existing services will not be overwritten or discarded.`,
    };
  }
  return undefined;
}

function normalizePrefix(prefix: string): string {
  const withSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return withSlash !== '/' ? withSlash.replace(/\/+$/, '') : withSlash;
}

function publicRewrite(prefix: string, service: string): Rewrite {
  return {
    source: prefix === '/' ? '/(.*)' : `${prefix}(/.*)?`,
    destination: { service },
  };
}

interface WebServiceInfo {
  name: string;
  resolved: ExperimentalService;
  config: ExperimentalServiceConfig;
  prefix: string;
}

/**
 * Pure conversion of already-resolved services. Use `migrateExperimentalServices`
 * for filesystem resolution and validation.
 */
export function planExperimentalServicesMigration(
  config: LegacyServicesConfig,
  resolvedServices: ExperimentalService[]
): ExperimentalServicesMigrationPlan {
  const conflict = getServicesConfigConflict(config);
  if (conflict) return emptyPlanWithErrors([conflict]);
  const plan = emptyPlanWithErrors([]);

  const legacy = config.experimentalServices;

  if (isNonEmptyObject(config.experimentalServicesV2)) {
    plan.patch.services = { ...config.experimentalServicesV2 };
    plan.removeKeys.push('experimentalServicesV2');
    return plan;
  }

  if (!isNonEmptyObject(legacy)) {
    plan.errors.push({
      code: 'NO_LEGACY_SERVICES',
      message: 'No `experimentalServices` configuration found to migrate.',
    });
    return plan;
  }

  plan.removeKeys.push('experimentalServices');
  if (config.experimentalServiceGroups !== undefined) {
    plan.removeKeys.push('experimentalServiceGroups');
    plan.warnings.push({
      code: 'SERVICE_GROUPS_DROPPED',
      message:
        '`experimentalServiceGroups` has no equivalent in `services` and was removed.',
      link: SERVICES_DOCS_URL,
    });
  }

  // Drop non-web services before validating output names.
  const webServices: WebServiceInfo[] = [];
  const resolvedByName = new Map(resolvedServices.map(s => [s.name, s]));
  for (const [legacyName, serviceConfig] of Object.entries(legacy)) {
    const resolved = resolvedByName.get(legacyName);
    if (!resolved) {
      plan.errors.push({
        code: 'UNRESOLVED_SERVICE',
        serviceName: legacyName,
        message: `Service "${legacyName}" could not be resolved. Fix the errors reported for it before migrating.`,
      });
      continue;
    }
    if (resolved.type !== 'web') {
      plan.unmigrated.push(getUnmigratedNote(legacyName, resolved));
      continue;
    }
    const name = legacyName.toLowerCase();
    if (name.length > 64 || !/^[a-z]([a-z_-]*[a-z])?$/.test(name)) {
      plan.errors.push({
        code: 'INVALID_SERVICE_NAME',
        serviceName: legacyName,
        message: `Service name "${legacyName}" is not valid for \`services\`. Names must be 1-64 characters, start and end with a lowercase letter, and contain only lowercase letters, hyphens, and underscores. Rename it in \`experimentalServices\` first.`,
      });
      continue;
    }
    const conflict = webServices.find(s => s.name === name);
    if (conflict) {
      plan.errors.push({
        code: 'DUPLICATE_SERVICE_NAME',
        serviceName: legacyName,
        message: `Services "${conflict.resolved.name}" and "${legacyName}" both map to "${name}". Rename one of them first.`,
      });
      continue;
    }
    if (name !== legacyName) {
      plan.renamedServices.push({ from: legacyName, to: name });
    }
    webServices.push({
      name,
      resolved,
      config: serviceConfig,
      prefix: normalizePrefix(resolved.routePrefix ?? '/'),
    });
  }
  if (plan.errors.length > 0) return plan;

  if (webServices.length === 0) {
    plan.errors.push({
      code: 'NO_WEB_SERVICES',
      message:
        'None of the configured services are web services. `services` only describes web services; see the manual steps for the others.',
    });
    return plan;
  }

  for (const consumer of webServices) {
    plan.patch.services[consumer.name] = convertWebService(
      consumer,
      webServices,
      plan,
      config.build?.env ?? {}
    );
  }

  // Explicit prefixes win even on another service's host. Service handoffs
  // are terminal, so put host rules after prefixes but before the root fallback.
  const subpaths = webServices
    .filter(svc => svc.prefix !== '/')
    .sort((a, b) => b.prefix.length - a.prefix.length);
  plan.patch.rewrites = subpaths.map(svc =>
    publicRewrite(svc.prefix, svc.name)
  );
  for (const { name, prefix, resolved } of subpaths) {
    const { subdomain } = resolved;
    if (!subdomain) continue;
    const hostRewrite: Rewrite = {
      source: '/(.*)',
      has: [{ type: 'host', value: { pre: `${subdomain}.` } }],
      missing: PREVIEW_DOMAIN_MISSING,
      destination: { service: name },
    };
    if (resolved.builder.use === '@vercel/next') {
      // Next's route table retains basePath, including on subdomain requests.
      plan.patch.rewrites.push({
        ...hostRewrite,
        source: '/',
        destination: { service: name, path: prefix },
      });
      hostRewrite.source = '/:path(.*)';
      hostRewrite.destination = { service: name, path: `${prefix}/:path` };
    }
    plan.patch.rewrites.push(hostRewrite);
    plan.warnings.push({
      code: 'SUBDOMAIN_ROUTING',
      serviceName: resolved.name,
      message: `"${subdomain}.<your-domain>" routes to "${resolved.name}". Explicit service prefixes take precedence. Host routing still applies only to custom domains, not preview URLs.`,
      link: SERVICES_ROUTING_DOCS_URL,
    });
  }
  plan.patch.rewrites.push(
    ...webServices
      .filter(svc => svc.prefix === '/')
      .map(svc => publicRewrite('/', svc.name))
  );

  // Build settings belong to the root workspace, not necessarily the '/' route.
  const rootService = webServices.find(s => s.resolved.workspace === '.');
  for (const key of TOP_LEVEL_BUILD_KEYS) {
    const value = config[key];
    if (value === undefined) continue;
    plan.removeKeys.push(key);
    if (key === 'framework' && (value === 'services' || value === null))
      continue;
    if (!rootService) {
      plan.errors.push({
        code: 'TOP_LEVEL_SETTING_WITHOUT_ROOT_SERVICE',
        message: `Top-level \`${key}\` is not allowed with \`services\` and there is no service with root "." to receive it. Move it into the relevant service manually.`,
      });
      continue;
    }
    const target = plan.patch.services[rootService.name];
    if (key === 'functions') {
      target.functions = {
        ...(value as BuilderFunctions),
        ...target.functions,
      };
    } else if (value !== null && target[key] !== undefined) {
      plan.warnings.push({
        code: 'TOP_LEVEL_SETTING_CONFLICT',
        serviceName: rootService.resolved.name,
        message: `Top-level \`${key}\` was dropped because service "${rootService.resolved.name}" already defines it.`,
      });
      continue;
    } else if (value !== null) {
      target[key] = value as string;
    }
    plan.movedTopLevelKeys.push({ key, service: rootService.name });
  }

  if (Array.isArray(config.rewrites) && config.rewrites.length > 0) {
    plan.warnings.push({
      code: 'EXISTING_REWRITES',
      message:
        "Your existing top-level `rewrites` are kept ahead of the generated service rewrites. They are evaluated before a request is routed into a service, so rewrites that target a path inside a specific service should move into that service's own `rewrites`.",
      link: SERVICES_ROUTING_DOCS_URL,
    });
  }

  return plan;
}

function convertWebService(
  consumer: WebServiceInfo,
  webServices: WebServiceInfo[],
  plan: ExperimentalServicesMigrationPlan,
  existingBuildEnv: Record<string, string>
): ServiceConfig {
  const { resolved, config: serviceConfig, prefix } = consumer;
  const { name: legacyName, entrypoint } = resolved;
  const service: ServiceConfig = { root: resolved.workspace };
  const warn = (code: string, message: string, link?: string) => {
    plan.warnings.push({
      code,
      serviceName: legacyName,
      message: `Service "${legacyName}": ${message}`,
      ...(link ? { link } : {}),
    });
  };

  // Only carry an explicitly pinned framework; `services` detects it otherwise.
  if (serviceConfig.framework) service.framework = serviceConfig.framework;
  const runtime = serviceConfig.runtime;
  if (runtime) {
    if (runtime in RUNTIME_BUILDERS) {
      service.runtime = runtime;
    } else {
      warn(
        'RUNTIME_DROPPED',
        `Runtime "${runtime}" is not supported (${Object.keys(RUNTIME_BUILDERS).join(', ')}); it will be inferred from the entrypoint instead.`
      );
    }
  }

  if (entrypoint) {
    const handler = resolved.builder.config?.handlerFunction;
    // Rebuild Python module:attr from the root-relative file, retaining the callable.
    service.entrypoint =
      typeof handler === 'string' && entrypoint.endsWith('.py')
        ? `${entrypoint.slice(0, -3).replace(/\//g, '.')}:${handler}`
        : entrypoint;
  }
  if (serviceConfig.command !== undefined) {
    service.command = serviceConfig.command;
  }
  if (serviceConfig.installCommand !== undefined) {
    service.installCommand = serviceConfig.installCommand;
  }
  const buildCommand = combineBuildCommand(
    serviceConfig.buildCommand,
    serviceConfig.preDeployCommand
  );
  if (buildCommand !== undefined) service.buildCommand = buildCommand;
  if (serviceConfig.preDeployCommand) {
    warn(
      'PRE_DEPLOY_COMMAND_FOLDED',
      '`preDeployCommand` was appended to `buildCommand` and now runs at build time, not right before deployment.'
    );
  }
  if (serviceConfig.builder) {
    warn(
      'BUILDER_DROPPED',
      `Builder "${serviceConfig.builder}" was removed; \`services\` selects it from the framework and runtime.`
    );
  }
  if (serviceConfig.workspace) {
    warn('WORKSPACE_REPLACED', '`workspace` is now expressed by `root`.');
  }

  const fnConfig: Record<string, unknown> = {};
  for (const key of ['maxDuration', 'includeFiles', 'excludeFiles'] as const) {
    if (serviceConfig[key] !== undefined) fnConfig[key] = serviceConfig[key];
  }
  if (serviceConfig.memory !== undefined) {
    warn(
      'MEMORY_DROPPED',
      "`memory` cannot be configured in vercel.json with Fluid compute; use the project's Functions settings instead.",
      'https://vercel.com/docs/functions/configuring-functions/memory'
    );
  }
  if (Object.keys(fnConfig).length > 0) {
    if (entrypoint && resolved.runtime !== 'container') {
      service.functions = {
        [posixPath.normalize(entrypoint)]: fnConfig as BuilderFunctions[string],
      };
    } else {
      warn(
        'FUNCTION_CONFIG_DROPPED',
        `No file entrypoint for ${Object.keys(fnConfig).join(', ')}; configure them under this service's \`functions\` manually.`
      );
    }
  }

  // Legacy apps saw stripped paths, except Next, whose routes retain basePath.
  const isStatic = isStaticBuild(resolved);
  const rewrites: Rewrite[] = [];
  if (prefix !== '/') {
    if (isStatic || resolved.builder.use !== '@vercel/next') {
      rewrites.push({ source: `${prefix}/:path(.*)?`, destination: '/:path' });
    }
    if (isStatic) {
      rewrites.push({ source: '/:path*', destination: '/index.html' });
      warn(
        'STATIC_SUBPATH',
        `Static output is no longer nested under "${prefix}"; a service rewrite maps "${prefix}/*" onto it. Keep the framework base path (e.g. Vite \`base\`) at "${prefix}/".`,
        SERVICES_ROUTING_DOCS_URL
      );
    } else if (resolved.builder.use === '@vercel/next') {
      warn('NEXT_SUBPATH', `Keep \`basePath\` in next.config at "${prefix}".`);
    } else {
      warn(
        'PREFIX_STRIP',
        `A service rewrite keeps stripping "${prefix}", but ASGI \`root_path\` / WSGI \`SCRIPT_NAME\` is no longer set. Check redirects and generated URLs; remove the rewrite if the app should handle the prefix itself.`,
        SERVICES_ROUTING_DOCS_URL
      );
    }
  } else if (isStatic) {
    rewrites.push({ source: '/(.*)', destination: '/index.html' });
  }
  if (rewrites.length > 0) service.rewrites = rewrites;

  const bindings: ServiceBinding[] = [];
  const seenEnv = new Set<string>();
  const consumerPrefix = frameworkList.find(
    f => f.slug === resolved.framework
  )?.envPrefix;
  const bindingsUnsupported =
    resolved.runtime === 'go' || resolved.runtime === 'rust';
  // Group URL guidance per consumer rather than issuing a note for every pair.
  const implicit: string[] = [];
  const clientSide: string[] = [];
  const unsupported: string[] = [];

  const add = (target: WebServiceInfo, env: string, explicit: boolean) => {
    if (seenEnv.has(env)) return;
    seenEnv.add(env);
    if (consumerPrefix && env.startsWith(consumerPrefix)) {
      if (Object.prototype.hasOwnProperty.call(existingBuildEnv, env)) return;
      const defaults = (plan.patch.build ??= { env: {} }).env;
      if (defaults[env] !== undefined && defaults[env] !== target.prefix) {
        plan.errors.push({
          code: 'CONFLICTING_BUILD_ENV',
          serviceName: legacyName,
          message: `Services use \`${env}\` for different public paths. Set a shared value in \`build.env\` or use distinct environment variable names before migrating.`,
        });
      } else {
        defaults[env] = target.prefix;
      }
      return;
    }
    if (isStatic) {
      if (explicit) {
        clientSide.push(`\`${env}="${target.prefix}"\``);
      }
      return;
    }
    if (bindingsUnsupported) {
      unsupported.push(`\`${env}\``);
      return;
    }
    if (!explicit) implicit.push(`\`${env}\``);
    bindings.push({
      type: 'service',
      service: target.name,
      format: 'url',
      env,
    });
  };

  // Explicit `env` service refs first so they win over implicit names.
  for (const [env, ref] of Object.entries(serviceConfig.env ?? {})) {
    if (ref?.type !== 'service-ref') continue;
    const target = webServices.find(s => s.resolved.name === ref.service);
    if (!target) {
      warn(
        'SERVICE_REF_DROPPED',
        `\`${env}\` referenced "${ref.service}", which is not a web service and cannot be bound.`
      );
      continue;
    }
    add(target, env, true);
  }

  // Every web URL had a server-side variable and a framework-prefixed public path.
  for (const target of webServices) {
    const env = `${target.resolved.name.replace(/-/g, '_').toUpperCase()}_URL`;
    if (target !== consumer) {
      add(target, env, false);
    } else if (!seenEnv.has(env)) {
      seenEnv.add(env);
      warn(
        'SELF_SERVICE_URL_DROPPED',
        `Implicit self URL \`${env}\` is no longer injected; no self-binding was generated. If used at build time or on the server, define a project environment variable with the absolute public URL for "${prefix}" (including the origin), or derive it from the request.`,
        SERVICES_BINDINGS_DOCS_URL
      );
    }
    if (consumerPrefix) add(target, `${consumerPrefix}${env}`, false);
  }

  if (implicit.length > 0) {
    warn(
      'IMPLICIT_URL_TO_BINDING',
      `Previously implicit URLs now use bindings: ${implicit.join(', ')}. These resolve to internal URLs; remove unused bindings.`,
      SERVICES_BINDINGS_DOCS_URL
    );
  }
  if (clientSide.length > 0) {
    warn(
      'CLIENT_SIDE_SERVICE_URL',
      `Bindings only cover server-side calls. Define any client-side URLs still in use as project environment variables: ${clientSide.join(', ')}.`,
      SERVICES_BINDINGS_DOCS_URL
    );
  }
  if (unsupported.length > 0) {
    warn(
      'BINDINGS_UNSUPPORTED_RUNTIME',
      `The ${resolved.runtime} runtime does not support bindings; ${unsupported.join(', ')} will no longer be injected. Build a container image to use bindings, or call other services through public URLs.`,
      SERVICES_BINDINGS_DOCS_URL
    );
  }
  if (bindings.length > 0) service.bindings = bindings;
  return service;
}

function getUnmigratedNote(
  legacyName: string,
  resolved: ExperimentalService
): ServicesMigrationNote {
  const isPython = resolved.runtime === 'python';
  let guidance: string;
  if (resolved.type === 'cron' || resolved.trigger === 'schedule') {
    guidance = isPython
      ? 'Declare the schedule in your Python app (for example with APScheduler in the web service) or expose the job as a route and add it to top-level `crons`.'
      : 'Expose the job as a route in a web service and add it to top-level `crons`.';
  } else if (resolved.trigger === 'workflow') {
    guidance = isPython
      ? "Declare it as a `[[tool.vercel.workflows]]` entry in the owning service's pyproject.toml."
      : 'Move it into a web service that uses the Workflow SDK.';
  } else {
    guidance = isPython
      ? "Declare it as a `[[tool.vercel.subscribers]]` entry in the owning service's pyproject.toml."
      : 'Move the queue consumer into a web service that subscribes to the topic.';
  }

  return {
    code: 'UNSUPPORTED_SERVICE_TYPE',
    serviceName: legacyName,
    message: `"${legacyName}" (type "${resolved.type}"${
      resolved.trigger ? `, trigger "${resolved.trigger}"` : ''
    }) has no equivalent in \`services\` and was left out. ${guidance}`,
    link: EXPERIMENTAL_SERVICES_DOCS_URL,
  };
}

export interface MigrateExperimentalServicesOptions {
  fs: DetectorFilesystem;
  /** Defaults to vercel.json/vercel.toml read from fs. */
  config?: LegacyServicesConfig;
  /** Defaults to resolving experimentalServices against fs. */
  resolvedServices?: ExperimentalService[];
}

/** Resolve legacy services and validate the generated config against the same filesystem. */
export async function migrateExperimentalServices(
  options: MigrateExperimentalServicesOptions
): Promise<ExperimentalServicesMigrationPlan> {
  const { fs } = options;
  let { config, resolvedServices } = options;
  if (!config) {
    const read = await readVercelConfig(fs);
    if (read.error) return emptyPlanWithErrors([read.error]);
    config = read.config ?? {};
  }

  const conflict = getServicesConfigConflict(config);
  if (conflict) return emptyPlanWithErrors([conflict]);

  if (!resolvedServices && isNonEmptyObject(config.experimentalServices)) {
    const result = await resolveAllConfiguredServices(
      config.experimentalServices,
      fs,
      'configured'
    );
    if (result.errors.length > 0) {
      return emptyPlanWithErrors(result.errors);
    }
    resolvedServices = result.services;
  }

  const plan = planExperimentalServicesMigration(
    config,
    resolvedServices ?? []
  );
  if (plan.errors.length > 0) return plan;

  const check = await resolveAllConfiguredServicesV2(plan.patch.services, fs);
  plan.errors.push(
    ...check.errors.map(error => ({
      ...error,
      message: `Generated \`services\` config is invalid: ${error.message}`,
    }))
  );

  return plan;
}

function emptyPlanWithErrors(
  errors: ServiceDetectionError[]
): ExperimentalServicesMigrationPlan {
  return {
    patch: { services: {}, rewrites: [] },
    removeKeys: [],
    movedTopLevelKeys: [],
    renamedServices: [],
    warnings: [],
    unmigrated: [],
    errors,
  };
}
