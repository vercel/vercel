import type { Framework } from '@vercel/frameworks';
import { detectFrameworks } from '../detect-framework';
import frameworkList from '@vercel/frameworks';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type { ExperimentalServices, ServiceDetectionError } from './types';

export interface AutoDetectOptions {
  fs: DetectorFilesystem;
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
 * Auto-detect services when experimentalServices is not configured.
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
  const { fs } = options;

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
          message: `Multiple frameworks detected at root: ${frameworkNames}. Use explicit experimentalServices config.`,
        },
      ],
    };
  }

  if (rootFrameworks.length === 1) {
    return detectServicesAtRoot(fs, rootFrameworks[0]);
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
            message: `Multiple frameworks detected in ${frontendLocation}/: ${frameworkNames}. Use explicit experimentalServices config.`,
          },
        ],
      };
    }

    if (frontendFrameworks.length === 1) {
      return detectServicesFrontendSubdir(
        fs,
        frontendFrameworks[0],
        frontendLocation
      );
    }
  }

  return {
    services: null,
    errors: [
      {
        code: 'NO_SERVICES_CONFIGURED',
        message:
          'No services detected. Configure experimentalServices in vercel.json or ensure a framework exists at project root, frontend/, or apps/web/.',
      },
    ],
  };
}

async function detectServicesAtRoot(
  fs: DetectorFilesystem,
  rootFramework: Framework
): Promise<AutoDetectResult> {
  const services: ExperimentalServices = {};

  services.frontend = {
    framework: rootFramework.slug ?? undefined,
    routePrefix: '/',
  };

  const backendResult = await detectBackendServices(fs);
  if (backendResult.error) {
    return { services: null, errors: [backendResult.error] };
  }
  Object.assign(services, backendResult.services);

  return { services, errors: [] };
}

async function detectServicesFrontendSubdir(
  fs: DetectorFilesystem,
  frontendFramework: Framework,
  frontendLocation: string
): Promise<AutoDetectResult> {
  const services: ExperimentalServices = {};

  // Infer service name from directory (e.g., "frontend" or "web" from "apps/web")
  const serviceName = frontendLocation.split('/').pop() || 'frontend';

  services[serviceName] = {
    framework: frontendFramework.slug ?? undefined,
    workspace: frontendLocation,
    routePrefix: '/',
  };

  const backendResult = await detectBackendServices(fs);
  if (backendResult.error) {
    return { services: null, errors: [backendResult.error] };
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

  return { services, errors: [] };
}

async function detectBackendServices(fs: DetectorFilesystem): Promise<{
  services: ExperimentalServices;
  error?: ServiceDetectionError;
}> {
  const services: ExperimentalServices = {};

  const backendResult = await detectServiceInDir(fs, BACKEND_DIR, 'backend');
  if (backendResult.error) {
    return { services: {}, error: backendResult.error };
  }
  if (backendResult.service) {
    services.backend = backendResult.service;
  }

  const multiServicesResult = await detectServicesDirectory(fs);
  if (multiServicesResult.error) {
    return { services: {}, error: multiServicesResult.error };
  }

  for (const serviceName of Object.keys(multiServicesResult.services)) {
    if (services[serviceName]) {
      return {
        services: {},
        error: {
          code: 'SERVICE_NAME_CONFLICT',
          message: `Service name conflict: "${serviceName}" exists in both ${BACKEND_DIR}/ and ${SERVICES_DIR}/${serviceName}/. Rename one of the directories or use explicit experimentalServices config.`,
          serviceName,
        },
      };
    }
  }

  Object.assign(services, multiServicesResult.services);

  return { services };
}

async function detectServicesDirectory(fs: DetectorFilesystem): Promise<{
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

    const result = await detectServiceInDir(fs, serviceDir, serviceName);
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
  serviceName: string
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
        message: `Multiple frameworks detected in ${dirPath}/: ${frameworkNames}. Use explicit experimentalServices config.`,
        serviceName,
      },
    };
  }

  if (frameworks.length === 1) {
    const framework = frameworks[0];

    return {
      service: {
        framework: framework.slug ?? undefined,
        workspace: dirPath,
        routePrefix: `/_/${serviceName}`,
      },
    };
  }

  return {};
}
