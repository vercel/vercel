import type { Framework } from '@vercel/frameworks';
import { detectFrameworks } from '../detect-framework';
import { frameworkList } from '@vercel/frameworks';
import type {
  DetectorFilesystem,
  DetectorFilesystemStat,
} from '../detectors/filesystem';
import type {
  ExperimentalServices,
  ServiceDetectionError,
  ServiceDetectionWarning,
} from './types';
import { assignRoutePrefixes, isFrontendFramework } from './utils';

export interface AutoDetectOptions {
  fs: DetectorFilesystem;
}

export interface AutoDetectResult {
  services: ExperimentalServices | null;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

// Runtime frameworks, e.g. Python, Node, Ruby, etc. are currently marked experimental,
// but service auto-detection should still consider them.
const DETECTION_FRAMEWORKS = frameworkList.filter(
  (framework: Framework) =>
    !framework.experimental || framework.runtimeFramework
);

/** Directories that should never be scanned for services. */
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'vendor']);

function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name);
}

interface ServiceCandidate {
  /** Service name (derived from directory name) */
  name: string;
  /** Relative path to the service directory (undefined for root) */
  path: string | undefined;
  /** Detected framework */
  framework: Framework;
}

/**
 * Auto-detect services by scanning the project for frameworks.
 *
 * Scans the project root and all top-level directories for frameworks.
 * Directories without a framework are treated as potential parent directories
 * and their children are scanned one level deep.
 *
 * Route prefix assignment:
 * - Single service: gets `/`
 * - Single frontend among multiple services: frontend gets `/`, rest get `/_/{name}`
 * - Multiple frontends: `web` or `frontend` preferred for `/`, rest get `/_/{name}`
 * - No frontends: all get `/_/{name}`
 */
export async function autoDetectServices(
  options: AutoDetectOptions
): Promise<AutoDetectResult> {
  const { fs } = options;

  // Phase 1: Detect framework at root
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
      warnings: [],
    };
  }

  // Phase 2: Scan top-level directories for service candidates
  const candidates: ServiceCandidate[] = [];
  let entries: DetectorFilesystemStat[];
  try {
    entries = await fs.readdir('/');
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    if (entry.type !== 'dir' || shouldSkipDir(entry.name)) {
      continue;
    }

    const result = await scanDirectory(fs, entry.name, entry.name);
    if (result.error) {
      return { services: null, errors: [result.error], warnings: [] };
    }
    candidates.push(...result.candidates);
  }

  // Phase 3: Include root framework as a candidate
  const rootFramework = rootFrameworks[0] ?? null;
  if (rootFramework && candidates.length > 0) {
    const rootName = pickRootServiceName(rootFramework, candidates);
    candidates.push({
      name: rootName,
      path: undefined,
      framework: rootFramework,
    });
  }

  // Phase 4: Require at least 2 services
  if (candidates.length < 2) {
    if (candidates.length === 0 && !rootFramework) {
      return {
        services: null,
        errors: [
          {
            code: 'NO_SERVICES_CONFIGURED',
            message:
              'No services detected. Configure experimentalServices in vercel.json or ensure your project has at least two directories with detectable frameworks.',
          },
        ],
        warnings: [],
      };
    }
    return { services: null, errors: [], warnings: [] };
  }

  // Phase 5: Check for name conflicts
  const nameMap = new Map<string, ServiceCandidate[]>();
  for (const candidate of candidates) {
    const existing = nameMap.get(candidate.name) ?? [];
    existing.push(candidate);
    nameMap.set(candidate.name, existing);
  }

  for (const [name, group] of nameMap) {
    if (group.length > 1) {
      const paths = group.map(c => c.path ?? 'project root').join(' and ');
      return {
        services: null,
        errors: [
          {
            code: 'SERVICE_NAME_CONFLICT',
            message: `Service name conflict: "${name}" found in ${paths}. Rename one of the directories or use explicit experimentalServices config.`,
            serviceName: name,
          },
        ],
        warnings: [],
      };
    }
  }

  // Phase 6: Build services config and assign route prefixes
  const services: ExperimentalServices = {};
  for (const candidate of candidates) {
    services[candidate.name] = {
      framework: candidate.framework.slug ?? undefined,
      entrypoint: candidate.path,
      // routePrefix assigned by assignRoutePrefixes below
    };
  }

  const warnings = assignRoutePrefixes(services);

  return { services, errors: [], warnings };
}

/**
 * Scan a directory for frameworks.
 *
 * If the directory itself contains a framework, it becomes a service candidate.
 * If not, scan its children one level deep (auto-detecting parent directories
 * like apps/, packages/, services/).
 */
async function scanDirectory(
  fs: DetectorFilesystem,
  dirPath: string,
  name: string
): Promise<{
  candidates: ServiceCandidate[];
  error?: ServiceDetectionError;
}> {
  const dirFs = fs.chdir(dirPath);
  const frameworks = await detectFrameworks({
    fs: dirFs,
    frameworkList: DETECTION_FRAMEWORKS,
    useExperimentalFrameworks: true,
  });

  if (frameworks.length > 1) {
    const frameworkNames = frameworks.map(f => f.name).join(', ');
    return {
      candidates: [],
      error: {
        code: 'MULTIPLE_FRAMEWORKS_SERVICE',
        message: `Multiple frameworks detected in ${dirPath}/: ${frameworkNames}. Use explicit experimentalServices config.`,
        serviceName: name,
      },
    };
  }

  if (frameworks.length === 1) {
    return {
      candidates: [{ name, path: dirPath, framework: frameworks[0] }],
    };
  }

  // No framework found — scan children (auto-detect parent directory)
  let children;
  try {
    children = await dirFs.readdir('/');
  } catch {
    return { candidates: [] };
  }

  const childCandidates: ServiceCandidate[] = [];

  for (const child of children) {
    if (child.type !== 'dir' || shouldSkipDir(child.name)) {
      continue;
    }

    const childPath = `${dirPath}/${child.name}`;
    const childFs = fs.chdir(childPath);
    const childFrameworks = await detectFrameworks({
      fs: childFs,
      frameworkList: DETECTION_FRAMEWORKS,
      useExperimentalFrameworks: true,
    });

    if (childFrameworks.length > 1) {
      const frameworkNames = childFrameworks.map(f => f.name).join(', ');
      return {
        candidates: [],
        error: {
          code: 'MULTIPLE_FRAMEWORKS_SERVICE',
          message: `Multiple frameworks detected in ${childPath}/: ${frameworkNames}. Use explicit experimentalServices config.`,
          serviceName: child.name,
        },
      };
    }

    if (childFrameworks.length === 1) {
      childCandidates.push({
        name: child.name,
        path: childPath,
        framework: childFrameworks[0],
      });
    }
  }

  return { candidates: childCandidates };
}

/**
 * Pick a service name for a root framework that doesn't conflict
 * with existing candidates.
 */
function pickRootServiceName(
  framework: Framework,
  candidates: ServiceCandidate[]
): string {
  const candidateNames = new Set(candidates.map(c => c.name));
  const preferredName = isFrontendFramework(framework.slug)
    ? 'frontend'
    : 'api';

  if (!candidateNames.has(preferredName)) {
    return preferredName;
  }
  if (!candidateNames.has('app')) {
    return 'app';
  }
  if (!candidateNames.has('root')) {
    return 'root';
  }
  return 'root-app';
}
