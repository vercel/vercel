import type { Framework } from '@vercel/frameworks';
import type { DetectEntrypointFn } from '@vercel/build-utils';
import { detectFrameworks } from '../detect-framework';
import { frameworkList } from '@vercel/frameworks';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type { ExperimentalServices, ServiceDetectionError } from './types';
import { isFrontendFramework } from './utils';

export interface AutoDetectOptions {
  fs: DetectorFilesystem;
  /**
   * Optional callback used to enrich runtime services with a normalized
   * entrypoint (file path or `module:attr` reference).
   */
  detectEntrypoint?: DetectEntrypointFn;
}

export interface AutoDetectResult {
  services: ExperimentalServices | null;
  errors: ServiceDetectionError[];
}

const FRONTEND_DIR = 'frontend';
const APPS_WEB_DIR = 'apps/web';
const BACKEND_DIR = 'backend';
const SERVICES_DIR = 'services';

const FRONTEND_LOCATIONS = [FRONTEND_DIR, APPS_WEB_DIR];
// Runtime frameworks, e.g. Python, Node, Ruby, etc. are currently marked experimental,
// but service auto-detection should still consider them.
const DETECTION_FRAMEWORKS = frameworkList.filter(
  (framework: Framework) =>
    !framework.experimental || framework.runtimeFramework
);

/**
 * Auto-detect services when services are not configured.
 *
 * Scans the project for frameworks, supporting multiple layouts:
 *
 * Frontend at root, backend in backend/:
 *   project/
 *   ├── package.json
 *   └── backend/
 *
 * Frontend in frontend/, backend in backend/:
 *   project/
 *   ├── frontend/
 *   └── backend/
 *
 * Frontend in frontend/, backend in services/{service-name}/:
 *   project/
 *   ├── frontend/
 *   └── services/
 *       ├── service-a/
 *       └── service-b/
 *
 * Frontend in apps/web/ monorepo, backend in services/{service-name}/:
 *   project/
 *   ├── apps/web/
 *   └── services/
 *       ├── service-a/
 *       └── service-b/
 */
export async function autoDetectServices(
  options: AutoDetectOptions
): Promise<AutoDetectResult> {
  const { fs, detectEntrypoint } = options;

  const rootFrameworks = await detectFrameworks({
    fs,
    frameworkList,
  });

  if (rootFrameworks.length > 1) {
    const frameworkNames = rootFrameworks.map(f => f.name).join(', ');
    return {
      services: null,
      errors: [
        {
          code: 'MULTIPLE_FRAMEWORKS_ROOT',
          message: `Multiple frameworks detected at root: ${frameworkNames}. Use explicit services config.`,
        },
      ],
    };
  }

  if (rootFrameworks.length === 1) {
    return detectServicesAtRoot(fs, rootFrameworks[0], detectEntrypoint);
  }

  for (const frontendLocation of FRONTEND_LOCATIONS) {
    const hasFrontendDir = await fs.hasPath(frontendLocation);
    if (!hasFrontendDir) {
      continue;
    }

    const frontendFs = fs.chdir(frontendLocation);
    const frontendFrameworks = await detectFrameworks({
      fs: frontendFs,
      frameworkList,
    });

    if (frontendFrameworks.length > 1) {
      const frameworkNames = frontendFrameworks.map(f => f.name).join(', ');
      return {
        services: null,
        errors: [
          {
            code: 'MULTIPLE_FRAMEWORKS_SERVICE',
            message: `Multiple frameworks detected in ${frontendLocation}/: ${frameworkNames}. Use explicit services config.`,
          },
        ],
      };
    }

    if (frontendFrameworks.length === 1) {
      return detectServicesFrontendSubdir(
        fs,
        frontendFrameworks[0],
        frontendLocation,
        detectEntrypoint
      );
    }
  }

  return {
    services: null,
    errors: [
      {
        code: 'NO_SERVICES_CONFIGURED',
        message:
          'No services detected. Configure services in vercel.json or ensure a framework exists at project root, frontend/, or apps/web/.',
      },
    ],
  };
}

async function detectServicesAtRoot(
  fs: DetectorFilesystem,
  rootFramework: Framework,
  detectEntrypoint: DetectEntrypointFn | undefined
): Promise<AutoDetectResult> {
  const services: ExperimentalServices = {};

  services.frontend = {
    framework: rootFramework.slug ?? undefined,
    routePrefix: '/',
  };

  const backendResult = await detectBackendServices(fs, detectEntrypoint);
  if (backendResult.error) {
    return {
      services: null,
      errors: [backendResult.error],
    };
  }
  if (Object.keys(backendResult.services).length === 0) {
    return {
      services: null,
      errors: [],
    };
  }
  Object.assign(services, backendResult.services);

  return {
    services,
    errors: [],
  };
}

async function detectServicesFrontendSubdir(
  fs: DetectorFilesystem,
  frontendFramework: Framework,
  frontendLocation: string,
  detectEntrypoint: DetectEntrypointFn | undefined
): Promise<AutoDetectResult> {
  const services: ExperimentalServices = {};

  // Infer service name from directory (e.g., "frontend" or "web" from "apps/web")
  const serviceName = frontendLocation.split('/').pop() || 'frontend';

  services[serviceName] = {
    framework: frontendFramework.slug ?? undefined,
    root: frontendLocation,
    routePrefix: '/',
  };

  const backendResult = await detectBackendServices(fs, detectEntrypoint);
  if (backendResult.error) {
    return {
      services: null,
      errors: [backendResult.error],
    };
  }

  // At least one backend service is required with frontend in frontend/ or apps/web
  if (Object.keys(backendResult.services).length === 0) {
    return {
      services: null,
      errors: [
        {
          code: 'NO_BACKEND_SERVICES',
          message: `Frontend detected in ${frontendLocation}/ but no backend services found. Add a backend/ or services/ directory with a supported framework.`,
        },
      ],
    };
  }

  Object.assign(services, backendResult.services);

  return {
    services,
    errors: [],
  };
}

async function detectBackendServices(
  fs: DetectorFilesystem,
  detectEntrypoint: DetectEntrypointFn | undefined
): Promise<{
  services: ExperimentalServices;
  error?: ServiceDetectionError;
}> {
  const services: ExperimentalServices = {};

  const backendResult = await detectServiceInDir(
    fs,
    BACKEND_DIR,
    'backend',
    detectEntrypoint
  );
  if (backendResult.error) {
    return { services: {}, error: backendResult.error };
  }
  if (backendResult.service) {
    services.backend = backendResult.service;
  }

  const multiServicesResult = await detectServicesDirectory(
    fs,
    detectEntrypoint
  );
  if (multiServicesResult.error) {
    return { services: {}, error: multiServicesResult.error };
  }

  for (const serviceName of Object.keys(multiServicesResult.services)) {
    if (services[serviceName]) {
      return {
        services: {},
        error: {
          code: 'SERVICE_NAME_CONFLICT',
          message: `Service name conflict: "${serviceName}" exists in both ${BACKEND_DIR}/ and ${SERVICES_DIR}/${serviceName}/. Rename one of the directories or use explicit services config.`,
          serviceName,
        },
      };
    }
  }

  Object.assign(services, multiServicesResult.services);

  return { services };
}

async function detectServicesDirectory(
  fs: DetectorFilesystem,
  detectEntrypoint: DetectEntrypointFn | undefined
): Promise<{
  services: ExperimentalServices;
  error?: ServiceDetectionError;
}> {
  const services: ExperimentalServices = {};

  const hasServicesDir = await fs.hasPath(SERVICES_DIR);
  if (!hasServicesDir) {
    return { services };
  }

  const servicesFs = fs.chdir(SERVICES_DIR);
  const entries = await servicesFs.readdir('/');

  for (const entry of entries) {
    if (entry.type !== 'dir') {
      continue;
    }

    const serviceName = entry.name;
    const serviceDir = `${SERVICES_DIR}/${serviceName}`;

    const result = await detectServiceInDir(
      fs,
      serviceDir,
      serviceName,
      detectEntrypoint
    );
    if (result.error) {
      return { services: {}, error: result.error };
    }
    if (result.service) {
      services[serviceName] = result.service;
    }
  }

  return { services };
}

async function detectServiceInDir(
  fs: DetectorFilesystem,
  dirPath: string,
  serviceName: string,
  detectEntrypoint: DetectEntrypointFn | undefined
): Promise<{
  service?: ExperimentalServices[string];
  error?: ServiceDetectionError;
}> {
  const hasDirPath = await fs.hasPath(dirPath);
  if (!hasDirPath) {
    return {};
  }

  const serviceFs = fs.chdir(dirPath);
  const frameworks = await detectFrameworks({
    fs: serviceFs,
    frameworkList: DETECTION_FRAMEWORKS,
    useExperimentalFrameworks: true,
  });

  if (frameworks.length > 1) {
    const frameworkNames = frameworks.map(f => f.name).join(', ');
    return {
      error: {
        code: 'MULTIPLE_FRAMEWORKS_SERVICE',
        message: `Multiple frameworks detected in ${dirPath}/: ${frameworkNames}. Use explicit services config.`,
        serviceName,
      },
    };
  }

  if (frameworks.length !== 1) {
    return {};
  }

  const framework = frameworks[0];
  const slug = framework.slug ?? undefined;
  const routePrefix = `/_/${serviceName}`;

  const detected =
    detectEntrypoint && !isFrontendFramework(slug)
      ? await detectEntrypoint({ workPath: dirPath, framework: slug })
      : null;
  return {
    service: {
      framework: slug,
      root: dirPath,
      ...(detected ? { entrypoint: detected.entrypoint } : {}),
      routePrefix,
    },
  };
}
