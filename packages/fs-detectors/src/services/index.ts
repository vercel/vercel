/**
 * Services Detection Module
 *
 * This module provides functionality for detecting and resolving services
 * in a Vercel project. It supports two modes:
 *
 * 1. **Explicit Mode**: Services are explicitly configured in vercel.json
 *    via the `experimentalServices` field. Each service must have an
 *    `entrypoint` specified.
 *
 * 2. **Zero-Config Mode**: Services are auto-detected by walking the
 *    filesystem, finding manifest files (package.json, pyproject.toml, etc.),
 *    and matching them with common entrypoint patterns.
 *
 * @example Explicit Mode (vercel.json)
 * ```json
 * {
 *   "framework": "services",
 *   "experimentalServices": {
 *     "api": {
 *       "entrypoint": "src/server.ts",
 *       "runtime": "node"
 *     },
 *     "backend": {
 *       "entrypoint": "main.py",
 *       "runtime": "python"
 *     }
 *   }
 * }
 * ```
 *
 * @example Zero-Config Auto-Detection
 * ```
 * project/
 * ├── package.json        → "default" service (Node.js)
 * │   └── index.ts
 * └── backend/
 *     ├── pyproject.toml  → "backend" service (Python)
 *     └── main.py
 * ```
 */

import type { DetectorFilesystem } from '../detectors/filesystem';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServiceDetectionError,
  ExperimentalServices,
} from './types';
import {
  detectManifests,
  groupManifestsByDirectory,
  getPrimaryRuntime,
} from './manifests';
import { verifyEntrypoint, detectEntrypoint } from './entrypoints';
import {
  validateServiceConfig,
  resolveExplicitService,
  resolveAutoDetectedService,
  deriveServiceName,
} from './resolve';

// ═══════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════

export * from './types';
export * from './manifests';
export * from './entrypoints';
export * from './resolve';
export * from './builders';

// ═══════════════════════════════════════════════════════════════════════════
// Main Detection Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detects services in a project.
 *
 * Priority order:
 * 1. Explicit services passed via options (`explicitServices`)
 * 2. Services from `vercel.json` (`experimentalServices`)
 * 3. Zero-config auto-detection based on manifest files
 *
 * For explicit services, `entrypoint` is REQUIRED.
 * For zero-config, multiple services are detected based on manifest files
 * and common entrypoint patterns.
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath = '' } = options;
  const services: ResolvedService[] = [];
  const errors: ServiceDetectionError[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Get explicit services (from options or vercel.json)
  // ─────────────────────────────────────────────────────────────────────────

  let experimentalServices: ExperimentalServices | undefined =
    options.explicitServices;

  if (!experimentalServices) {
    const fromConfig = await readExperimentalServicesFromConfig(fs, workPath);

    if (fromConfig.error) {
      errors.push(fromConfig.error);
      return { services, errors };
    }

    experimentalServices = fromConfig.services;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: If explicit services exist, resolve them
  // ─────────────────────────────────────────────────────────────────────────

  if (experimentalServices && typeof experimentalServices === 'object') {
    for (const name of Object.keys(experimentalServices)) {
      const config = experimentalServices[name];

      // Validate the configuration
      const validationError = validateServiceConfig(name, config);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      // Verify the entrypoint exists
      const entrypointPath = await verifyEntrypoint(
        fs,
        config.entrypoint!,
        workPath || '.'
      );

      if (!entrypointPath) {
        errors.push({
          code: 'ENTRYPOINT_NOT_FOUND',
          message: `Service "${name}": entrypoint "${config.entrypoint}" does not exist.`,
          serviceName: name,
        });
        continue;
      }

      // Resolve the service
      const resolved = resolveExplicitService(name, config, workPath || '.');
      services.push(resolved);
    }

    return { services, errors };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Zero-config auto-detection
  // ─────────────────────────────────────────────────────────────────────────

  const detectedServices = await autoDetectServices(fs);
  services.push(...detectedServices);

  return { services, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reads experimentalServices from vercel.json.
 * Returns an error if vercel.json exists but is invalid.
 */
async function readExperimentalServicesFromConfig(
  fs: DetectorFilesystem,
  workPath: string
): Promise<{
  services?: ExperimentalServices;
  error?: ServiceDetectionError;
}> {
  const configPath = workPath ? `${workPath}/vercel.json` : 'vercel.json';
  const hasConfig = await fs.hasPath(configPath);

  if (!hasConfig) {
    // No vercel.json - proceed with zero-config detection
    return {};
  }

  try {
    const buffer = await fs.readFile(configPath);
    const config = JSON.parse(buffer.toString('utf-8'));
    return { services: config.experimentalServices };
  } catch (err) {
    // vercel.json exists but is invalid - return error
    return {
      error: {
        code: 'INVALID_VERCEL_JSON',
        message: `Failed to parse vercel.json: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
      },
    };
  }
}

/**
 * Auto-detects multiple services by finding manifest files and matching
 * them with entrypoints.
 */
async function autoDetectServices(
  fs: DetectorFilesystem
): Promise<ResolvedService[]> {
  const services: ResolvedService[] = [];

  // Find all manifest files
  const manifests = await detectManifests(fs);
  if (manifests.length === 0) return services;

  // Group manifests by directory
  const byDirectory = groupManifestsByDirectory(manifests);

  // For each directory with a manifest, try to find an entrypoint
  for (const [directory, dirManifests] of byDirectory) {
    const runtime = getPrimaryRuntime(dirManifests);
    const entrypoint = await detectEntrypoint(fs, runtime, directory);

    if (entrypoint) {
      const name = deriveServiceName(directory);
      const service = resolveAutoDetectedService(
        name,
        entrypoint,
        runtime,
        directory
      );
      services.push(service);
    }
    // If no entrypoint found, silently skip this directory
  }

  return services;
}
