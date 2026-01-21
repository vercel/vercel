import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServiceDetectionError,
  ServiceDetectionWarning,
  ExperimentalServices,
  ServiceRuntime,
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
import { getBuilderForRuntime } from './utils';
import frameworkList from '@vercel/frameworks';

// Default service name when workspace is at root directory
const ROOT_SERVICE_NAME = 'root';

export * from './types';
export * from './resolve';
export * from './utils';
export { getServicesBuilders } from './builders';

/**
 * Detect and resolve services within a project.
 *
 * If `explicitServices` is provided (from vercel.json), only those services
 * are built (exhaustive mode). Otherwise, services are auto-detected from
 * manifest files and entrypoints (zero-config mode).
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath = '' } = options;

  // Use explicit services if provided, otherwise read from vercel.json
  let experimentalServices: ExperimentalServices | undefined =
    options.explicitServices;

  if (!experimentalServices) {
    const configPath = workPath ? `${workPath}/vercel.json` : 'vercel.json';

    const hasVercelJson = await fs.hasPath(configPath);
    if (hasVercelJson) {
      try {
        const configBuffer = await fs.readFile(configPath);
        const config = JSON.parse(configBuffer.toString('utf-8'));
        experimentalServices = config.experimentalServices;
      } catch (err) {
        return {
          services: [],
          errors: [
            {
              code: 'INVALID_VERCEL_JSON',
              message: `Failed to parse vercel.json: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
            },
          ],
        };
      }
    }
    // No vercel.json - continue to auto-detection
  }

  if (experimentalServices && typeof experimentalServices === 'object') {
    return resolveExplicitServices(experimentalServices);
  }

  // Auto-detect services from manifests and entrypoints
  const frameworks = options.frameworkList || frameworkList;
  return autoDetectServices(fs, frameworks);
}

/**
 * Resolve explicit services from vercel.json experimentalServices.
 */
function resolveExplicitServices(
  experimentalServices: ExperimentalServices
): DetectServicesResult {
  const services: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];
  const webServicesWithoutRoutePrefix: string[] = [];

  for (const name of Object.keys(experimentalServices)) {
    const serviceConfig = experimentalServices[name];

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

    const resolved = resolveService(name, serviceConfig);
    services.push(resolved);
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

  return { services, errors };
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
): Promise<DetectServicesResult> {
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

  return {
    name,
    type: 'web',
    workspace,
    framework,
    entrypoint: frameworkBuilderSrc,
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

  return {
    name,
    type: 'web',
    workspace,
    runtime,
    framework,
    entrypoint: entrypointRelativeToWorkspace,
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
