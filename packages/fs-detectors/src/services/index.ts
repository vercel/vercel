import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServiceDetectionError,
  ServiceDetectionWarning,
  ExperimentalServices,
  ServiceRuntime,
  ServicesRoutes,
} from './types';
import type { Framework } from '@vercel/frameworks';
import { validateServiceConfig, resolveService } from './resolve';
import {
  detectManifests,
  groupManifestsByDirectory,
  hasConflictingServices,
} from './manifests';
import { detectAllEntrypoints } from './entrypoints';
import { detectFramework } from '../detect-framework';
import { getBuilderForRuntime, readVercelConfig } from './utils';
import frameworkList from '@vercel/frameworks';

// Default service name when workspace is at root directory
const ROOT_SERVICE_NAME = 'root';

export * from './types';
export * from './resolve';
export * from './utils';
export { getServicesBuilders } from './builders';
export { generateServicesRoutes };

/**
 * Detect and resolve services within a project.
 *
 * This is the main entry point for service detection. It:
 * 1. Reads vercel.json to check for configured services
 * 2. If `experimentalServices` exists, resolves those (configured)
 * 3. Otherwise, auto-detects from manifests and entrypoints (detected)
 * 4. Generates routing rules for the services
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath } = options;
  const frameworks = options.frameworkList || frameworkList;

  // Scope filesystem to workPath if provided
  const scopedFs = workPath ? fs.chdir(workPath) : fs;

  // Step 1: Read vercel.json
  const { config: vercelConfig, error: configError } =
    await readVercelConfig(scopedFs);

  if (configError) {
    return {
      services: [],
      source: 'configured',
      routes: { rewrites: [], defaults: [] },
      errors: [configError],
      warnings: [],
    };
  }

  const configuredServices = vercelConfig?.experimentalServices;
  const hasConfiguredServices =
    configuredServices && Object.keys(configuredServices).length > 0;

  // Step 2: Resolve services from the appropriate source
  let services: ResolvedService[];
  let errors: ServiceDetectionError[];
  let warnings: ServiceDetectionWarning[];

  if (hasConfiguredServices) {
    // Use explicitly configured services from vercel.json
    const result = resolveConfiguredServices(configuredServices);
    services = result.services;
    errors = result.errors;
    warnings = [];
  } else {
    // Auto-detect services from manifests and entrypoints
    const result = await autoDetectServices(scopedFs, frameworks);
    services = result.services;
    errors = result.errors;
    warnings = result.warnings;
  }

  // Step 3: Generate routes
  const routes = generateServicesRoutes(services);

  return {
    services,
    source: hasConfiguredServices ? 'configured' : 'detected',
    routes,
    errors,
    warnings,
  };
}

/**
 * Resolve services explicitly configured in vercel.json experimentalServices.
 */
function resolveConfiguredServices(services: ExperimentalServices): {
  services: ResolvedService[];
  errors: ServiceDetectionError[];
} {
  const resolved: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];
  const webServicesWithoutRoutePrefix: string[] = [];

  for (const name of Object.keys(services)) {
    const serviceConfig = services[name];

    const validationError = validateServiceConfig(name, serviceConfig);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    // Only web services need routePrefix for routing
    const serviceType = serviceConfig.type || 'web';
    if (serviceType === 'web' && serviceConfig.routePrefix === undefined) {
      webServicesWithoutRoutePrefix.push(name);
    }

    const service = resolveService(name, serviceConfig);
    resolved.push(service);
  }

  // Only one web service can omit routePrefix (defaults to "/")
  // Workers and crons don't need routePrefix since they're not routed via HTTP
  if (webServicesWithoutRoutePrefix.length > 1) {
    errors.push({
      code: 'MULTIPLE_ROOT_SERVICES',
      message: `Only one web service can omit "routePrefix". Web services without routePrefix: ${webServicesWithoutRoutePrefix.join(', ')}`,
    });
    // Don't return ambiguous services - user must fix the config
    return { services: [], errors };
  }

  return { services: resolved, errors };
}

/**
 * Auto-detect services from manifest files and entrypoints.
 *
 * Process:
 * 1. Walk the project to find all manifest files (package.json, pyproject.toml, etc.)
 * 2. Group manifests by directory
 * 3. For each directory:
 *    a. Run framework detection - if detected, use framework's builder
 *    b. If no framework, search for entrypoints for that manifest's runtime
 *    c. If entrypoints found, create a service
 *    d. If multiple entrypoints found at same level, throw error (ambiguous routing)
 */
async function autoDetectServices(
  fs: Parameters<typeof detectServices>[0]['fs'],
  frameworks: readonly Framework[]
): Promise<{
  services: ResolvedService[];
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}> {
  const services: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];
  const warnings: ServiceDetectionWarning[] = [];

  // Step 1: Find all manifest files
  const manifests = await detectManifests(fs);

  if (manifests.length === 0) {
    errors.push({
      code: 'NO_MANIFESTS_FOUND',
      message:
        'No package.json, pyproject.toml, go.mod, or other manifest files found. ' +
        'Add a manifest file or configure services explicitly in vercel.json.',
    });
    return { services, errors, warnings };
  }

  // Step 2: Group manifests by directory
  const grouped = groupManifestsByDirectory(manifests);

  // Step 3: Process each directory
  for (const [dir, dirManifests] of grouped) {
    // Create a scoped filesystem for this directory
    const scopedFs = dir === '.' ? fs : fs.chdir(dir);

    // Step 3a: Try framework detection first
    const detectedFramework = await detectFramework({
      fs: scopedFs,
      frameworkList: frameworks,
    });

    if (detectedFramework) {
      const frameworkDef = frameworks.find(f => f.slug === detectedFramework);
      const frameworkEntrypoint = frameworkDef?.useRuntime?.src;

      // Verify the framework's entrypoint exists
      if (
        frameworkEntrypoint &&
        (await scopedFs.hasPath(frameworkEntrypoint))
      ) {
        // Framework detected and entrypoint exists - use framework's builder
        const service = createServiceFromFramework(
          dir,
          detectedFramework,
          frameworkDef
        );
        services.push(service);
        continue;
      }
      // Framework detected but entrypoint doesn't exist - fall through to runtime detection
    }

    // Step 3b: Look for entrypoints (either no framework, or framework entrypoint missing)
    // Get all unique runtimes from manifests in this directory
    const runtimes = [...new Set(dirManifests.map(m => m.runtime))];

    // Step 3c: Detect all entrypoints across all runtimes in this directory
    const detectedEntrypoints = await detectAllEntrypoints(fs, dir, runtimes);

    // Step 3d: Check for conflicting services (multiple entrypoints at same level)
    if (hasConflictingServices(detectedEntrypoints.map(e => e.path))) {
      const entrypointFiles = detectedEntrypoints.map(e => e.path).join(', ');
      errors.push({
        code: 'CONFLICTING_SERVICES',
        message:
          `Directory "${dir}" has multiple entrypoints (${entrypointFiles}). ` +
          'Cannot auto-detect which service to use. ' +
          'Remove one entrypoint or configure `experimentalServices` explicitly in vercel.json.',
      });
      continue;
    }

    // If we found an entrypoint, create a service (include framework if detected)
    if (detectedEntrypoints.length === 1) {
      const { path: entrypoint, runtime } = detectedEntrypoints[0];
      const service = createServiceFromEntrypoint(
        dir,
        entrypoint,
        runtime,
        detectedFramework ?? undefined
      );
      services.push(service);
      continue;
    }

    // No entrypoint found - skip this directory with a warning
    if (detectedEntrypoints.length === 0) {
      warnings.push({
        code: 'NO_ENTRYPOINT',
        message:
          `No HTTP entrypoint found in "${dir}". ` +
          'Add an entrypoint file (e.g., index.ts, app.py, main.go) or skip this directory.',
      });
    }
  }

  if (services.length === 0 && errors.length === 0) {
    errors.push({
      code: 'NO_SERVICES_DETECTED',
      message:
        'No services could be auto-detected. ' +
        'Add manifest files with entrypoints or configure services explicitly in vercel.json.',
    });
  }

  return { services, errors, warnings };
}

function createServiceFromFramework(
  workspace: string,
  framework: string,
  frameworkDef?: Framework
): ResolvedService {
  const name = workspace === '.' ? ROOT_SERVICE_NAME : workspace;
  const frameworkBuilderSrc = frameworkDef?.useRuntime?.src || 'package.json';

  // For root services, use the framework builder with auto-discovery
  // For subdirectory services, use the runtime builder with explicit full path
  // This avoids needing special workspace handling in the CLI
  const isRoot = workspace === '.';
  const builderUse = isRoot
    ? frameworkDef?.useRuntime?.use || '@vercel/static-build'
    : getBuilderForRuntime(getFrameworkRuntime(frameworkDef));
  const builderSrc = isRoot
    ? frameworkBuilderSrc
    : `${workspace}/${frameworkBuilderSrc}`;

  // In zero-config mode, routePrefix defaults to workspace path
  // Root services get '/', subdirectory services get '/${workspace}'
  const routePrefix = isRoot ? '/' : `/${workspace}`;

  // The function path is where routing rules will direct traffic
  const functionPath = `/_services/${name}`;

  return {
    name,
    type: 'web',
    workspace,
    framework,
    entrypoint: frameworkBuilderSrc,
    functionPath,
    routePrefix,
    builder: {
      src: builderSrc,
      use: builderUse,
      config: {
        zeroConfig: true,
        framework,
      },
    },
  };
}

/**
 * Determine the runtime for a framework based on its builder
 */
function getFrameworkRuntime(frameworkDef?: Framework): ServiceRuntime {
  const builder = frameworkDef?.useRuntime?.use || '';
  if (builder.includes('python')) return 'python';
  if (builder.includes('go')) return 'go';
  if (builder.includes('ruby')) return 'ruby';
  if (builder.includes('rust')) return 'rust';
  return 'node'; // Default to node for most frameworks
}

function createServiceFromEntrypoint(
  workspace: string,
  entrypoint: string,
  runtime: ServiceRuntime,
  framework?: string
): ResolvedService {
  const name = workspace === '.' ? ROOT_SERVICE_NAME : workspace;
  const isRoot = workspace === '.';
  const builderUse = getBuilderForRuntime(runtime);
  // Entrypoint path is already relative to project root from detectEntrypoint
  const entrypointRelativeToWorkspace = isRoot
    ? entrypoint
    : entrypoint.replace(`${workspace}/`, '');

  // In zero-config mode, routePrefix defaults to workspace path
  // Root services get '/', subdirectory services get '/${workspace}'
  const routePrefix = isRoot ? '/' : `/${workspace}`;

  // The function path is where routing rules will direct traffic
  const functionPath = `/_services/${name}`;

  return {
    name,
    type: 'web',
    workspace,
    runtime,
    framework,
    entrypoint: entrypointRelativeToWorkspace,
    functionPath,
    routePrefix,
    builder: {
      // Use full path - runtime builders respect the src we pass
      src: entrypoint,
      use: builderUse,
      config: {
        zeroConfig: true,
        ...(framework && { framework }),
      },
    },
  };
}

/**
 * Generate routing rules for services.
 *
 * Routes are ordered by prefix length (longest first) to ensure more specific
 * routes match before broader ones. For example, `/api/users` must be checked
 * before `/api`, which must be checked before the catch-all `/`.
 */
function generateServicesRoutes(services: ResolvedService[]): ServicesRoutes {
  const rewrites: Route[] = [];
  const defaults: Route[] = [];

  // Sort by prefix length (longest first) so specific routes match before broad ones.
  // Primary services (empty prefix "/") go last as the catch-all fallback.
  const sortedServices = [...services].sort((a, b) => {
    const prefixA = a.routePrefix || '';
    const prefixB = b.routePrefix || '';
    // Empty prefix (primary) should come last
    if (prefixA === '' && prefixB !== '') return 1;
    if (prefixB === '' && prefixA !== '') return -1;
    // Otherwise sort by length (longest first)
    return prefixB.length - prefixA.length;
  });

  for (const service of sortedServices) {
    const prefix = service.routePrefix || '';
    // Use the explicit functionPath - this is set during service resolution
    // and represents where the routing layer should direct traffic
    const { functionPath } = service;

    // Worker and Cron services have internal routes
    if (service.type === 'worker' || service.type === 'cron') {
      // Add a direct route for the function path itself
      rewrites.push({
        src: `^${functionPath}(?:/.*)?$`,
        dest: functionPath,
        check: true,
      });
      continue;
    }

    // Web services
    if (prefix === '' || prefix === '/') {
      // Primary service: catch-all route
      defaults.push({
        src: '^/(.*)$',
        dest: functionPath,
        check: true,
      });
    } else {
      // Non-primary service: prefix-based rewrite
      const normalizedPrefix = prefix.startsWith('/')
        ? prefix.slice(1)
        : prefix;
      rewrites.push({
        src: `^/${normalizedPrefix}(?:/(.*))?$`,
        dest: functionPath,
        check: true,
      });
    }
  }

  return { rewrites, defaults };
}
