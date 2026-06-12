import type { Route } from '@vercel/routing-utils';
import type { Builder } from '@vercel/build-utils';
import type {
  ConfiguredServices,
  ConfiguredServicesType,
  Service,
} from './types';
import { detectServices } from './detect-services';
import { LocalFileSystemDetector } from '../detectors/local-file-system-detector';

export interface ErrorResponse {
  code: string;
  message: string;
  action?: string;
  link?: string;
}

export interface GetServicesBuildersOptions {
  workPath?: string;
  configuredServices?: ConfiguredServices;
  configuredServicesType?: ConfiguredServicesType;
  projectFramework?: string | null;
}

export interface ServicesBuildersResult {
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
  warnings: ErrorResponse[];
  hostRewriteRoutes: Route[] | null;
  defaultRoutes: Route[] | null;
  fallbackRoutes: Route[] | null;
  redirectRoutes: Route[] | null;
  rewriteRoutes: Route[] | null;
  errorRoutes: Route[] | null;
  services?: Service[];
  useImplicitEnvInjection?: boolean;
}

function isExperimentalServicesAutoDetectionEnabled(): boolean {
  const env = process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
  return env === '1' || env?.toLowerCase() === 'true';
}

/**
 * Get builders for services - adapter for detectBuilders.
 *
 * This function wraps `detectServices` and transforms the result into
 * the shape expected by `detectBuilders` when `framework === 'services'`.
 */
export async function getServicesBuilders(
  options: GetServicesBuildersOptions
): Promise<ServicesBuildersResult> {
  const {
    workPath,
    configuredServices,
    configuredServicesType,
    projectFramework,
  } = options;
  const hasServiceDefinitions =
    configuredServices != null && Object.keys(configuredServices).length > 0;

  if (
    projectFramework === 'services' &&
    !hasServiceDefinitions &&
    !isExperimentalServicesAutoDetectionEnabled()
  ) {
    return {
      builders: null,
      errors: [
        {
          code: 'MISSING_EXPERIMENTAL_SERVICES',
          message:
            'Project framework is set to "services", but no services are declared. Add `experimentalServices` to vercel.json with at least one service, or change the project framework setting.',
        },
      ],
      warnings: [],
      hostRewriteRoutes: null,
      defaultRoutes: null,
      fallbackRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  if (!workPath) {
    return {
      builders: null,
      errors: [
        {
          code: 'MISSING_WORK_PATH',
          message: 'workPath is required for services detection.',
        },
      ],
      warnings: [],
      hostRewriteRoutes: null,
      defaultRoutes: null,
      fallbackRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  const fs = new LocalFileSystemDetector(workPath);
  const result = await detectServices({
    fs,
    configuredServices,
    configuredServicesType,
  });

  // Transform warnings to ErrorResponse format
  const warningResponses: ErrorResponse[] = result.warnings.map(w => ({
    code: w.code,
    message: w.message,
  }));

  // Transform errors and return early if any
  if (result.errors.length > 0) {
    return {
      builders: null,
      errors: result.errors.map(e => ({
        code: e.code,
        message: e.message,
      })),
      warnings: warningResponses,
      hostRewriteRoutes: null,
      defaultRoutes: null,
      fallbackRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  if (result.services.length === 0) {
    return {
      builders: null,
      errors: [
        {
          code: 'NO_EXPERIMENTAL_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ],
      warnings: warningResponses,
      hostRewriteRoutes: null,
      defaultRoutes: null,
      fallbackRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  // Extract builders from services
  const builders: Builder[] = result.services.map(service => service.builder);

  return {
    builders: builders.length > 0 ? builders : null,
    errors: null,
    warnings: warningResponses,
    hostRewriteRoutes:
      result.routes.hostRewrites.length > 0 ? result.routes.hostRewrites : null,
    defaultRoutes:
      result.routes.defaults.length > 0 ? result.routes.defaults : null,
    fallbackRoutes:
      result.routes.fallbacks.length > 0 ? result.routes.fallbacks : null,
    redirectRoutes: [],
    rewriteRoutes:
      result.routes.rewrites.length > 0 ||
      result.routes.workers.length > 0 ||
      result.routes.crons.length > 0
        ? [
            ...result.routes.rewrites,
            ...result.routes.workers,
            ...result.routes.crons,
          ]
        : null,
    errorRoutes: [],
    services: result.services,
    useImplicitEnvInjection: result.useImplicitEnvInjection,
  };
}

/**
 * Returns warnings for ignored directories that are not covered by services
 */
export function warnIgnoredDirectories(
  files: string[],
  configuredServices: ConfiguredServices
): ErrorResponse[] {
  const warnings: ErrorResponse[] = [];

  if (files.some(f => f.startsWith('api/'))) {
    const serviceCoversApi = Object.values(configuredServices).some(service => {
      const root = service.root ?? '.';
      const entrypoint = service.entrypoint ?? '';
      return (
        root === 'api' ||
        root.startsWith('api/') ||
        (root === '.' && entrypoint.startsWith('api/'))
      );
    });
    if (!serviceCoversApi) {
      warnings.push({
        code: 'api_dir_ignored',
        message:
          'The `api/` directory will not be built because `experimentalServices` is configured. To serve these files, declare them as a service in your `vercel.json`.',
      });
    }
  }

  return warnings;
}
