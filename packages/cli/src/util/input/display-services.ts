import { frameworkList } from '@vercel/frameworks';
import type {
  ResolvedService,
  ServiceDetectionError,
} from '@vercel/fs-detectors';
import output from '../../output-manager';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chalk = require('chalk');

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

function getFrameworkName(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return frameworksBySlug.get(slug)?.name;
}

function formatRoutePrefix(routePrefix: string): string {
  if (routePrefix === '/') {
    return '/';
  }
  // Ensure it starts with / and ends with /*
  const normalized = routePrefix.startsWith('/')
    ? routePrefix
    : `/${routePrefix}`;
  return `${normalized}/*`;
}

function getServiceDescription(service: ResolvedService): string {
  const frameworkName = getFrameworkName(service.framework);

  // Show the most detailed info: framework > runtime > builder
  if (frameworkName) {
    return chalk.cyan(`[${frameworkName}]`);
  } else if (service.runtime) {
    return chalk.yellow(`[${service.runtime}]`);
  } else if (service.builder?.use) {
    return chalk.magenta(`[${service.builder.use}]`);
  }
  return chalk.dim('[unknown]');
}

function getServiceTarget(service: ResolvedService): string {
  switch (service.type) {
    case 'cron':
      return `schedule: ${service.schedule ?? 'none'}`;
    case 'worker':
      return `topic: ${service.topic ?? 'none'}`;
    case 'web':
    default:
      return service.routePrefix
        ? formatRoutePrefix(service.routePrefix)
        : 'no route';
  }
}

/**
 * Output format:
 * Multiple services detected. Project Settings:
 * - frontend [Next.js] → /
 * - api [python] → /api/*
 * - cleanup [node] → schedule: 0 0 * * *
 * - processor [node] → topic: jobs
 */
export function displayDetectedServices(services: ResolvedService[]): void {
  output.print(`Multiple services detected. Project Settings:\n`);

  for (const service of services) {
    const description = getServiceDescription(service);
    const target = getServiceTarget(service);
    const line = `- ${chalk.bold(service.name)} ${description} ${chalk.dim('→')} ${target}`;
    output.print(`${line}\n`);
  }
}

export function displayServicesConfigNote(): void {
  output.print(
    `\n${chalk.dim('Services (experimental) are configured via vercel.json.')}\n`
  );
}

export function displayServiceErrors(errors: ServiceDetectionError[]): void {
  for (const error of errors) {
    output.warn(error.message);
  }
}
