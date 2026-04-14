import yaml from 'js-yaml';
import { detectFrameworks } from '../detect-framework';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type {
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceDetectionError,
  ServiceDetectionWarning,
} from './types';
import { RUNTIME_BUILDERS } from './types';
import {
  assignRoutePrefixes,
  combineBuildCommand,
  DETECTION_FRAMEWORKS,
} from './utils';

export interface RenderDetectResult {
  services: ExperimentalServices | null;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

interface RenderService {
  name?: string;
  type?: string;
  runtime?: string;
  buildCommand?: string;
  startCommand?: string;
  preDeployCommand?: string;
  rootDir?: string;
  schedule?: string;
}

interface RenderConfig {
  services?: RenderService[];
}

const RENDER_YAML = 'render.yaml';

type RenderServiceType = 'web' | 'static';

const SERVICE_TYPE_MAP: Record<
  RenderServiceType,
  ExperimentalServiceConfig['type']
> = {
  web: 'web',
  static: 'web',
};

/**
 * Detect Render service configurations from render.yaml.
 */
export async function detectRenderServices(options: {
  fs: DetectorFilesystem;
}): Promise<RenderDetectResult> {
  const { fs } = options;

  const raw = await readRenderYaml(fs);
  if (raw.warning) {
    return { services: null, errors: [], warnings: [raw.warning] };
  } else if (!raw.content) {
    return { services: null, errors: [], warnings: [] };
  }

  const parsed = tryParseRenderConfig(raw.content);
  if (parsed.warning) {
    return { services: null, errors: [], warnings: [parsed.warning] };
  } else if (!parsed.config) {
    return { services: null, errors: [], warnings: [] };
  }

  const renderServices = parsed.config.services;
  if (!Array.isArray(renderServices) || renderServices.length === 0) {
    return { services: null, errors: [], warnings: [] };
  }

  const services: ExperimentalServices = {};
  const serviceNames = new Set<string>();
  const errors: ServiceDetectionError[] = [];
  const warnings: ServiceDetectionWarning[] = [];

  for (const rs of renderServices) {
    const serviceType = rs.type;

    // For now crons automatic detection is not supported, so produce a hint.
    // Later there will be an option to execute arbitrary bash commands,
    // so we would be able to automatically handle crons as well.
    if (serviceType === 'cron') {
      const name = rs.name ?? 'unnamed';
      const schedule = rs.schedule;

      const runtime =
        rs.runtime && rs.runtime in RUNTIME_BUILDERS ? rs.runtime : undefined;

      const hint: Record<string, string> = {
        type: 'cron',
        ...(schedule ? { schedule } : {}),
        entrypoint: '<path-to-handler>',
        ...(runtime ? { runtime } : {}),
      };

      warnings.push({
        code: 'RENDER_CRON_HINT',
        message:
          `Found Render cron service "${name}"` +
          (schedule ? ` (schedule: "${schedule}")` : '') +
          `. Vercel crons work with a file entrypoint. You can add the following to define this cron service:\n` +
          `"${name}": ${JSON.stringify(hint, null, 2)}`,
      });
      continue;
    }

    if (serviceType === 'worker') {
      const name = rs.name ?? 'unnamed';
      const runtime = rs.runtime ?? 'unknown';

      // we probably can improve our detection system
      // to automatically find python entrypoints for workers,
      // but at the moment we can only produce a useful hint
      if (runtime === 'python') {
        const hint: Record<string, string> = {
          type: 'worker',
          entrypoint: '<path-to-celery-app>',
          runtime: 'python',
        };

        warnings.push({
          code: 'RENDER_WORKER_HINT',
          message:
            `Found Render worker service "${name}". ` +
            `Python workers using Celery are supported. You can add the following to define this worker:\n` +
            `"${name}": ${JSON.stringify(hint, null, 2)}`,
        });
      } else {
        warnings.push({
          code: 'RENDER_WORKER_HINT',
          message:
            `Found Render worker service "${name}" with runtime "${runtime}". ` +
            `Only Python workers are currently supported.`,
        });
      }
      continue;
    }

    // TODO: private services are close on roadmap, but not yet here,
    // so we'll produce a hint to a user instead if they really want
    // to deploy this service
    if (serviceType === 'pserv') {
      const name = rs.name ?? 'unnamed';
      const hint: Record<string, string> = {
        entrypoint: rs.rootDir ?? '<path-to-entrypoint>',
        routePrefix: `/_/${name}`,
      };

      warnings.push({
        code: 'RENDER_PSERV_HINT',
        message:
          `Found Render private service "${name}". ` +
          `Private services are not yet supported. ` +
          `If you'd like to deploy it as a regular web service, you can add the following:\n` +
          `"${name}": ${JSON.stringify(hint, null, 2)}`,
      });
      continue;
    }

    if (!serviceType || !(serviceType in SERVICE_TYPE_MAP)) {
      continue;
    }

    const serviceName = rs.name;
    if (!serviceName) {
      warnings.push({
        code: 'RENDER_CONFIG_ERROR',
        message:
          'Skipped a Render service with no name. Each service in render.yaml must have a name.',
      });
      continue;
    }

    if (serviceNames.has(serviceName)) {
      errors.push({
        code: 'DUPLICATE_SERVICE',
        message: `Duplicate service name "${serviceName}" in render.yaml.`,
        serviceName,
      });
      continue;
    }
    serviceNames.add(serviceName);

    const rootDir = rs.rootDir || '.';
    const serviceFs = rootDir === '.' ? fs : fs.chdir(rootDir);

    const frameworks = await detectFrameworks({
      fs: serviceFs,
      frameworkList: DETECTION_FRAMEWORKS,
      useExperimentalFrameworks: true,
    });

    if (frameworks.length === 0) {
      warnings.push({
        code: 'SERVICE_SKIPPED',
        message: `Skipped Render service "${serviceName}": no framework detected. Configure it manually in experimentalServices.`,
      });
      continue;
    }

    if (frameworks.length > 1) {
      const names = frameworks.map(f => f.name).join(', ');
      errors.push({
        code: 'MULTIPLE_FRAMEWORKS_SERVICE',
        message: `Multiple frameworks detected for Render service "${serviceName}": ${names}. Use explicit experimentalServices config.`,
        serviceName,
      });
      continue;
    }

    const framework = frameworks[0];
    const vercelType = SERVICE_TYPE_MAP[serviceType as RenderServiceType];

    const serviceConfig: ExperimentalServiceConfig = {};
    serviceConfig.type = vercelType;
    serviceConfig.framework = framework.slug ?? undefined;

    if (rootDir !== '.') {
      serviceConfig.entrypoint = rootDir;
    }

    const buildCommand = combineBuildCommand(
      rs.buildCommand,
      rs.preDeployCommand
    );
    if (buildCommand) {
      serviceConfig.buildCommand = buildCommand;
    }

    services[serviceName] = serviceConfig;
  }

  if (errors.length > 0) {
    return { services: null, errors, warnings };
  }

  if (Object.keys(services).length === 0) {
    return { services: null, errors: [], warnings };
  }

  warnings.push(...assignRoutePrefixes(services));

  return { services, errors: [], warnings };
}

async function readRenderYaml(fs: DetectorFilesystem): Promise<{
  content: string | null;
  warning?: ServiceDetectionWarning;
}> {
  try {
    const exists = await fs.isFile(RENDER_YAML);
    if (!exists) return { content: null };

    const buf = await fs.readFile(RENDER_YAML);
    return { content: buf.toString('utf-8') };
  } catch (err) {
    return {
      content: null,
      warning: {
        code: 'RENDER_CONFIG_ERROR',
        message: `Failed to read ${RENDER_YAML}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

function tryParseRenderConfig(content: string): {
  config: RenderConfig | null;
  warning?: ServiceDetectionWarning;
} {
  try {
    const config = yaml.load(content) as RenderConfig;
    return { config };
  } catch (err) {
    return {
      config: null,
      warning: {
        code: 'RENDER_PARSE_ERROR',
        message: `Failed to parse ${RENDER_YAML}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}
