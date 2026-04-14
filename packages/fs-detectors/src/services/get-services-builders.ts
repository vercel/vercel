import type { Route } from '@vercel/routing-utils';
import type { Builder } from '@vercel/build-utils';
import type { Service } from './types';
import {
  detectServices,
  isExperimentalInferredServicesEnabled,
  resolveBuildableServices,
} from './detect-services';
import { LocalFileSystemDetector } from '../detectors/local-file-system-detector';

export interface ErrorResponse {
  code: string;
  message: string;
  action?: string;
  link?: string;
}

export interface GetServicesBuildersOptions {
  workPath?: string;
}

export interface ServicesBuildersResult {
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
  warnings: ErrorResponse[];
  hostRewriteRoutes: Route[] | null;
  defaultRoutes: Route[] | null;
  redirectRoutes: Route[] | null;
  rewriteRoutes: Route[] | null;
  errorRoutes: Route[] | null;
  services?: Service[];
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
  const { workPath } = options;

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
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  const fs = new LocalFileSystemDetector(workPath);
  const detection = await detectServices({ fs });
  const buildableResult = await resolveBuildableServices({
    detection,
    fs,
    useInferred: isExperimentalInferredServicesEnabled(),
  });

  if (!buildableResult) {
    return {
      builders: null,
      errors: [
        {
          code: 'NO_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ],
      warnings: [],
      hostRewriteRoutes: null,
      defaultRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  // Transform warnings to ErrorResponse format
  const warningResponses: ErrorResponse[] = buildableResult.warnings.map(w => ({
    code: w.code,
    message: w.message,
  }));

  // Transform errors and return early if any
  if (buildableResult.errors.length > 0) {
    return {
      builders: null,
      errors: buildableResult.errors.map(e => ({
        code: e.code,
        message: e.message,
      })),
      warnings: warningResponses,
      hostRewriteRoutes: null,
      defaultRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  if (buildableResult.services.length === 0) {
    return {
      builders: null,
      errors: [
        {
          code: 'NO_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ],
      warnings: warningResponses,
      hostRewriteRoutes: null,
      defaultRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  // Extract builders from services
  const builders: Builder[] = buildableResult.services.map(
    service => service.builder
  );

  return {
    builders: builders.length > 0 ? builders : null,
    errors: null,
    warnings: warningResponses,
    hostRewriteRoutes:
      buildableResult.routes.hostRewrites.length > 0
        ? buildableResult.routes.hostRewrites
        : null,
    defaultRoutes:
      buildableResult.routes.defaults.length > 0
        ? buildableResult.routes.defaults
        : null,
    redirectRoutes: [],
    rewriteRoutes:
      buildableResult.routes.rewrites.length > 0 ||
      buildableResult.routes.workers.length > 0 ||
      buildableResult.routes.crons.length > 0
        ? [
            ...buildableResult.routes.rewrites,
            ...buildableResult.routes.workers,
            ...buildableResult.routes.crons,
          ]
        : null,
    errorRoutes: [],
    services: buildableResult.services,
  };
}
