import chalk from 'chalk';
import { frameworkList } from '@vercel/frameworks';
import type {
  ResolvedService,
  ServiceDetectionError,
} from '@vercel/fs-detectors';
import output from '../../output-manager';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

function getFrameworkName(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return frameworksBySlug.get(slug)?.name;
}

/**
 * Format the route prefix for display.
 * Converts "/" to "/" and other prefixes to "/prefix/*"
 */
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

/**
 * Display services configured in vercel.json.
 *
 * Shows the most detailed info available in priority order:
 * 1. Framework name (if available): (Next.js), (Express), (Vite)
 * 2. Runtime (if no framework): [python], [ruby]
 * 3. Third-party builder (if no framework/runtime): [vercel-php@0.9.0]
 *
 * Output format:
 * Multiple services detected. Project Settings:
 * - web (Next.js) → /next/*
 * - frontend (Vite) → /
 * - express-api (Express) → /express-api/*
 * - fastapi-api [python] → /fastapi-api/*
 * - php-api [vercel-php@0.9.0] → /php-api/*
 * - ruby-api [ruby] → /ruby-api/*
 */
export function displayDetectedServices(services: ResolvedService[]): void {
  output.print(`Multiple services detected. Project Settings:\n`);

  for (const service of services) {
    const routeDisplay = formatRoutePrefix(service.routePrefix);
    const frameworkName = getFrameworkName(service.framework);

    let description = '';

    // Show the most detailed info: framework > runtime > builder
    if (frameworkName) {
      description = ` ${chalk.cyan(`[${frameworkName}]`)}`;
    } else if (service.runtime) {
      description = ` ${chalk.yellow(`[${service.runtime}]`)}`;
    } else {
      description = ` ${chalk.magenta(`[${service.builder.use}]`)}`;
    }

    const line = `- ${chalk.bold(service.name)}${description} ${chalk.dim('→')} ${routeDisplay}`;

    output.print(`${line}\n`);
  }
}

export function displayServicesConfigNote(): void {
  output.print(`\n${chalk.dim('Services are configured via vercel.json.')}\n`);
}

/**
 * Display service validation errors.
 */
export function displayServiceErrors(errors: ServiceDetectionError[]): void {
  for (const error of errors) {
    output.warn(error.message);
  }
}
