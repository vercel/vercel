import type { Route } from '@vercel/routing-utils';
import type { Builder } from '@vercel/build-utils';
import type { Framework } from '@vercel/frameworks';
import type { ResolvedService } from './types';
import { detectServices } from './index';
import { LocalFileSystemDetector } from '../detectors/local-file-system-detector';
import frameworkList from '@vercel/frameworks';

export interface ErrorResponse {
  code: string;
  message: string;
  action?: string;
  link?: string;
}

export interface GetServicesBuildersOptions {
  workPath?: string;
  frameworkList?: readonly Framework[];
}

export interface ServicesBuildersResult {
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
  warnings: ErrorResponse[];
  defaultRoutes: Route[] | null;
  redirectRoutes: Route[] | null;
  rewriteRoutes: Route[] | null;
  errorRoutes: Route[] | null;
  services?: ResolvedService[];
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
  const frameworks = options.frameworkList || frameworkList;

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
      defaultRoutes: null,
      redirectRoutes: null,
      rewriteRoutes: null,
      errorRoutes: null,
    };
  }

  const fs = new LocalFileSystemDetector(workPath);
  const result = await detectServices({
    fs,
    frameworkList: frameworks,
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
      defaultRoutes: null,
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
          code: 'NO_SERVICES_DETECTED',
          message:
            'No services detected. Please configure `experimentalServices` in vercel.json.',
        },
      ],
      warnings: warningResponses,
      defaultRoutes: null,
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
    defaultRoutes:
      result.routes.defaults.length > 0 ? result.routes.defaults : null,
    redirectRoutes: [],
    rewriteRoutes:
      result.routes.rewrites.length > 0 ? result.routes.rewrites : null,
    errorRoutes: [],
    services: result.services,
  };
}
