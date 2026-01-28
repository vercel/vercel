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
 * 1. Framework name (if available): [Next.js], [FastAPI]
 * 2. Runtime (if no framework): [python], [node]
 * 3. Third-party builder (if no framework/runtime): [@vercel/php]
 *
 * Output format:
 * Multiple services detected. Project Settings:
 * - frontend [Next.js] → /
 * - api [python] → /api/*
 * - php-api [@vercel/php] → /php/*
 */
export function displayDetectedServices(services: ResolvedService[]): void {
  output.print(`Multiple services detected. Project Settings:\n`);

  for (const service of services) {
    const routeDisplay = formatRoutePrefix(service.routePrefix!);
    const frameworkName = getFrameworkName(service.framework);

    let description: string;

    // Show the most detailed info: framework > runtime > builder
    if (frameworkName) {
      description = chalk.cyan(`[${frameworkName}]`);
    } else if (service.runtime) {
      description = chalk.yellow(`[${service.runtime}]`);
    } else if (service.builder?.use) {
      description = chalk.magenta(`[${service.builder.use}]`);
    } else {
      description = chalk.dim('[unknown]');
    }

    const line = `- ${chalk.bold(service.name)} ${description} ${chalk.dim('→')} ${routeDisplay}`;

    output.print(`${line}\n`);
  }
}

export function displayServicesConfigNote(): void {
  output.print(
    `\n${chalk.dim('Services (experimental) are configured via vercel.json.')}\n`
  );
}

/**
 * Display service validation errors.
 */
export function displayServiceErrors(errors: ServiceDetectionError[]): void {
  for (const error of errors) {
    output.warn(error.message);
  }
}
