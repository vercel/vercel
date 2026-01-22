import type { Framework } from '@vercel/frameworks';
import type { DetectorFilesystem } from '../../detectors/filesystem';
import type {
  ResolvedService,
  ServiceDetectionError,
  ServiceDetectionWarning,
  ServiceRuntime,
} from '../types';
import { detectFramework } from '../../detect-framework';
import { getBuilderForRuntime } from '../utils';
import {
  detectManifests,
  groupManifestsByDirectory,
  hasConflictingServices,
} from './manifests';
import { detectAllEntrypoints } from './entrypoints';

// Default service name when workspace is at root directory
const ROOT_SERVICE_NAME = 'root';

export interface AutoDetectResult {
  services: ResolvedService[];
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
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
export async function autoDetectServices(
  fs: DetectorFilesystem,
  frameworks: readonly Framework[]
): Promise<AutoDetectResult> {
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
        const service = createServiceFromDetectedFramework(
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
      const service = createServiceFromDetectedEntrypoint(
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

/**
 * Create a ResolvedService from a detected framework.
 */
function createServiceFromDetectedFramework(
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
 * Determine the runtime for a framework based on its builder.
 */
function getFrameworkRuntime(frameworkDef?: Framework): ServiceRuntime {
  const builder = frameworkDef?.useRuntime?.use || '';
  if (builder.includes('python')) return 'python';
  if (builder.includes('go')) return 'go';
  if (builder.includes('ruby')) return 'ruby';
  if (builder.includes('rust')) return 'rust';
  return 'node'; // Default to node for most frameworks
}

/**
 * Create a ResolvedService from a detected entrypoint.
 */
function createServiceFromDetectedEntrypoint(
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
