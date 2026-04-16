import { posix as posixPath } from 'path';
import toml from 'smol-toml';
import type { Framework } from '@vercel/frameworks';
import { frameworkList } from '@vercel/frameworks';
import { detectFrameworks } from '../detect-framework';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type {
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceDetectionError,
  ServiceDetectionWarning,
} from './types';
import { isFrontendFramework, inferRuntimeFromFramework } from './utils';

export interface RailwayDetectResult {
  services: ExperimentalServices | null;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

interface RailwayConfig {
  build?: {
    buildCommand?: string;
  };
  deploy?: {
    preDeployCommand?: string[] | string;
    cronSchedule?: string;
  };
}

interface RailwayConfigFile {
  dirPath: string;
  config: RailwayConfig;
}

interface ScanResult {
  configs: RailwayConfigFile[];
  warnings: ServiceDetectionWarning[];
}

interface ParseResult {
  config: RailwayConfig | null;
  warning?: ServiceDetectionWarning;
}

const RAILWAY_JSON = 'railway.json';
const RAILWAY_TOML = 'railway.toml';

// This is an arbitrary estimate, might require tweaking
const MAX_SCAN_DEPTH = 5;

const SKIP_DIRS = new Set([
  '.hg',
  '.git',
  '.svn',
  '.cache',
  '.next',
  '.now',
  '.vercel',
  '.venv',
  '.yarn',
  '.turbo',
  '.output',
  'node_modules',
  '__pycache__',
  'venv',
  'CVS',
]);

const DETECTION_FRAMEWORKS = frameworkList.filter(
  (framework: Framework) =>
    !framework.experimental || framework.runtimeFramework
);

/**
 * Detect Railway service configurations in the project.
 *
 * Scans for railway.{json,toml} files, parses them,
 * tries to detect frameworks in each service directory, and maps to
 * services format.
 *
 * When a Railway config has `deploy.preDeployCommand`, it's added to
 * `buildCommand` since we don't have a separate pre-deploy yet.
 */
export async function detectRailwayServices(options: {
  fs: DetectorFilesystem;
}): Promise<RailwayDetectResult> {
  const { fs } = options;

  const { configs, warnings } = await findRailwayConfigs(fs);
  if (configs.length === 0) {
    return { services: null, errors: [], warnings };
  }

  const services: ExperimentalServices = {};
  const serviceDirs = new Map<string, string>();
  const errors: ServiceDetectionError[] = [];

  for (const cf of configs) {
    const serviceFs = cf.dirPath === '.' ? fs : fs.chdir(cf.dirPath);
    const dirLabel = cf.dirPath === '.' ? 'root' : cf.dirPath;

    const frameworks = await detectFrameworks({
      fs: serviceFs,
      frameworkList: DETECTION_FRAMEWORKS,
      useExperimentalFrameworks: true,
    });

    // we don't have write access to the FS, so can't just define an entrypoint.
    // The best we can do is suggest a canonical schedule-triggered job service.
    if (cf.config.deploy?.cronSchedule) {
      const schedule = cf.config.deploy.cronSchedule;
      const runtime =
        frameworks.length === 1
          ? inferRuntimeFromFramework(frameworks[0].slug)
          : undefined;

      const hint: Record<string, string> = {
        type: 'job',
        trigger: 'schedule',
        schedule,
        entrypoint: '<path-to-handler>',
      };
      if (runtime) {
        hint.runtime = runtime;
      }

      warnings.push({
        code: 'RAILWAY_CRON_HINT',
        message:
          `Found Railway cron in ${dirLabel}/ (schedule: "${schedule}"). ` +
          `Vercel crons work with a file entrypoint. You can add the following to define this scheduled job service:\n` +
          `"${deriveServiceName(cf.dirPath)}": ${JSON.stringify(hint, null, 2)}`,
      });
      continue;
    }

    const serviceName = deriveServiceName(cf.dirPath);

    const existingDir = serviceDirs.get(serviceName);
    if (existingDir) {
      errors.push({
        code: 'DUPLICATE_SERVICE',
        message:
          `Duplicate service name "${serviceName}" derived from ${existingDir}/ and ${dirLabel}/. ` +
          `Rename one of the directories to avoid conflicts.`,
        serviceName,
      });
      continue;
    }
    serviceDirs.set(serviceName, dirLabel);

    if (frameworks.length === 0) {
      warnings.push({
        code: 'SERVICE_SKIPPED',
        message: `Skipped service in ${dirLabel}/: no framework detected. Configure it manually in experimentalServices.`,
      });
      continue;
    }

    if (frameworks.length > 1) {
      const names = frameworks.map(f => f.name).join(', ');
      errors.push({
        code: 'MULTIPLE_FRAMEWORKS_SERVICE',
        message: `Multiple frameworks detected in ${dirLabel}/: ${names}. Use explicit experimentalServices config.`,
        serviceName,
      });
      continue;
    }

    const framework = frameworks[0];

    let serviceConfig: ExperimentalServiceConfig = {};
    serviceConfig.framework = framework.slug ?? undefined;
    if (cf.dirPath !== '.') {
      serviceConfig.entrypoint = cf.dirPath;
    }

    const buildCommand = combineBuildCommand(
      cf.config.build?.buildCommand,
      cf.config.deploy?.preDeployCommand
    );
    if (buildCommand) {
      serviceConfig.buildCommand = buildCommand;
    }

    services[serviceName] = serviceConfig;
  }

  if (errors.length > 0) {
    return { services: null, errors, warnings };
  }

  const serviceNames = Object.keys(services);
  if (serviceNames.length === 0) {
    return { services: null, errors: [], warnings };
  }

  warnings.push(...assignRoutePrefixes(services));

  return { services, errors: [], warnings };
}

async function findRailwayConfigs(
  fs: DetectorFilesystem,
  dirPath = '.',
  depth = 0
): Promise<ScanResult> {
  const configs: RailwayConfigFile[] = [];
  const warnings: ServiceDetectionWarning[] = [];

  const readResult = await readRailwayConfigRaw(fs, dirPath);
  warnings.push(...readResult.warnings);
  const { config, warning } = tryParseRailwayConfig(readResult.raw);
  if (warning) {
    warnings.push(warning);
  }
  if (config) {
    configs.push({ dirPath, config });
  }

  if (depth >= MAX_SCAN_DEPTH) {
    return { configs, warnings };
  }

  const readPath = dirPath === '.' ? '/' : dirPath;
  let entries;
  try {
    entries = await fs.readdir(readPath);
  } catch {
    return { configs, warnings };
  }

  for (const entry of entries) {
    if (entry.type !== 'dir' || SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const childPath =
      dirPath === '.' ? entry.name : posixPath.join(dirPath, entry.name);
    const child = await findRailwayConfigs(fs, childPath, depth + 1);
    configs.push(...child.configs);
    warnings.push(...child.warnings);
  }

  return { configs, warnings };
}

async function readRailwayConfigRaw(
  fs: DetectorFilesystem,
  dirPath: string
): Promise<{
  raw: { path: string; content: string } | null;
  warnings: ServiceDetectionWarning[];
}> {
  const warnings: ServiceDetectionWarning[] = [];

  for (const filename of [RAILWAY_JSON, RAILWAY_TOML]) {
    const filePath =
      dirPath === '.' ? filename : posixPath.join(dirPath, filename);
    try {
      const exists = await fs.isFile(filePath);
      if (!exists) continue;
    } catch {
      continue;
    }

    try {
      const buf = await fs.readFile(filePath);
      return {
        raw: { path: filePath, content: buf.toString('utf-8') },
        warnings,
      };
    } catch (err) {
      warnings.push({
        code: 'RAILWAY_CONFIG_ERROR',
        message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { raw: null, warnings };
}

function tryParseRailwayConfig(
  raw: { path: string; content: string } | null
): ParseResult {
  if (!raw) {
    return { config: null };
  }

  try {
    const config = raw.path.endsWith('.toml')
      ? (toml.parse(raw.content) as unknown as RailwayConfig)
      : (JSON.parse(raw.content) as RailwayConfig);
    return { config };
  } catch (err) {
    return {
      config: null,
      warning: {
        code: 'RAILWAY_PARSE_ERROR',
        message: `Failed to parse ${raw.path}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

function deriveServiceName(dirPath: string): string {
  if (dirPath === '.') {
    return 'web';
  }
  const segments = dirPath.split('/');
  return segments[segments.length - 1];
}

function combineBuildCommand(
  buildCommand: string | undefined,
  preDeployCommand: string | string[] | undefined
): string | undefined {
  const preDeploy = Array.isArray(preDeployCommand)
    ? preDeployCommand.join(' && ')
    : preDeployCommand;

  if (preDeploy && buildCommand) {
    return `${buildCommand} && ${preDeploy}`;
  } else if (preDeploy) {
    return preDeploy;
  } else {
    return buildCommand;
  }
}

/**
 * Assign route prefixes.
 *
 * A frontend service gets `/`, the rest get `/_/{name}`.
 * A single non-frontend service would also get `/`.
 * If no frontend service found, then multiple services get `/_/{name}`.
 *
 * Priority for `/`: single service or frontend > name "frontend" or "web" > alphabetical.
 */
function assignRoutePrefixes(
  services: ExperimentalServices
): ServiceDetectionWarning[] {
  const warnings: ServiceDetectionWarning[] = [];
  const names = Object.keys(services);

  if (names.length === 1) {
    services[names[0]].routePrefix = '/';
    return warnings;
  }

  const frontendNames = names.filter(name =>
    isFrontendFramework(services[name].framework)
  );

  let rootName: string | null = null;
  if (frontendNames.length === 1) {
    rootName = frontendNames[0];
  } else if (frontendNames.length > 1) {
    rootName =
      frontendNames.find(n => n === 'frontend' || n === 'web') ??
      frontendNames.sort()[0];
    warnings.push({
      code: 'MULTIPLE_FRONTENDS',
      message: `Multiple frontend services detected (${frontendNames.join(', ')}). "${rootName}" was assigned routePrefix "/". Adjust manually if a different service should be the root.`,
    });
  }

  for (const name of names) {
    services[name].routePrefix = name === rootName ? '/' : `/_/${name}`;
  }

  return warnings;
}
