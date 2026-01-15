import type { Route } from '@vercel/routing-utils';
import type { Builder, ExperimentalServices } from '@vercel/build-utils';
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

export interface ServicesBuilderOptions {
  workPath?: string;
  experimentalServices?: ExperimentalServices;
  frameworkList?: readonly Framework[];
}

export interface ServicesBuilderResult {
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
 * This function is called from detectBuilders when `framework === 'services'`.
 * If experimentalServices is configured in vercel.json, returns the builders
 * for the specified services.
 * Otherwise, auto-detects services via zero-config entrypoint detection.
 *
 * Auto-detection flow:
 * 1. Walk project to find manifest files (package.json, pyproject.toml, etc.)
 * 2. For each directory with a manifest:
 *    - Run framework detection - if detected, use framework's builder
 *    - If no framework, search for entrypoints for that manifest's runtime
 *    - If entrypoints found, create a service
 * 3. Error if multiple entrypoints at same level (ambiguous routing)
 */
export async function getServicesBuilders(
  options: ServicesBuilderOptions
): Promise<ServicesBuilderResult> {
  const { experimentalServices, workPath } = options;
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
    explicitServices: experimentalServices,
    frameworkList: frameworks,
  });

  // Convert warnings to error format
  const warningResponses: ErrorResponse[] = (result.warnings || []).map(w => ({
    code: w.code,
    message: w.message,
  }));

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

  const builders: Builder[] = result.services.map(service => service.builder);
  const { rewriteRoutes, defaultRoutes } = generateServicesRoutes(
    result.services
  );

  return {
    builders: builders.length > 0 ? builders : null,
    errors: null,
    warnings: warningResponses,
    defaultRoutes,
    redirectRoutes: [],
    rewriteRoutes,
    errorRoutes: [],
    services: result.services,
  };
}

/**
 * Routes are ordered by prefix length (longest first) to ensure
 * more specific routes are matched before catch-all routes.
 */
export function generateServicesRoutes(services: ResolvedService[]): {
  rewriteRoutes: Route[];
  defaultRoutes: Route[];
} {
  const rewriteRoutes: Route[] = [];
  const defaultRoutes: Route[] = [];

  // Sort services by route prefix length (longest first, then primary last)
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
    const builderSrc = service.builder.src || '';
    // Strip extension to get function path
    const functionPath = '/' + builderSrc.replace(/\.[^/.]+$/, '');

    // Worker and Cron services have internal routes
    if (service.type === 'worker' || service.type === 'cron') {
      // Add a direct route for the function path itself
      rewriteRoutes.push({
        src: `^${functionPath}(?:/.*)?$`,
        dest: functionPath,
        check: true,
      });
      continue;
    }

    // Web services
    if (prefix === '' || prefix === '/') {
      // Primary service: catch-all route
      defaultRoutes.push({
        src: '^/(.*)$',
        dest: functionPath,
        check: true,
      });
    } else {
      // Non-primary service: prefix-based rewrite
      const normalizedPrefix = prefix.startsWith('/')
        ? prefix.slice(1)
        : prefix;
      rewriteRoutes.push({
        src: `^/${normalizedPrefix}(?:/(.*))?$`,
        dest: functionPath,
        check: true,
      });
    }
  }

  return { rewriteRoutes, defaultRoutes };
}
