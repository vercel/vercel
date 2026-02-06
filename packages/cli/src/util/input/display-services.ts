import { frameworkList } from '@vercel/frameworks';
import type {
  ResolvedService,
  ServiceDetectionError,
} from '@vercel/fs-detectors';
import output from '../../output-manager';
import table from '../output/table';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chalk = require('chalk');

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

// TODO: move this to frameworks.ts
const frameworkColors: Record<string, (text: string) => string> = {
  // JavaScript/TypeScript frameworks
  nextjs: chalk.white,
  vite: chalk.magenta,
  nuxtjs: chalk.green,
  remix: chalk.cyan,
  astro: chalk.magenta,
  gatsby: chalk.magenta,
  svelte: chalk.red,
  sveltekit: chalk.red,
  solidstart: chalk.blue,
  angular: chalk.red,
  vue: chalk.green,
  ember: chalk.red,
  preact: chalk.magenta,

  // Python frameworks
  fastapi: chalk.green,
  flask: chalk.cyan,

  // Node frameworks
  express: chalk.yellow,
  nest: chalk.red,
  hono: chalk.yellowBright,
};

const runtimeColors: Record<string, (text: string) => string> = {
  node: chalk.green,
  python: chalk.blue,
  go: chalk.cyan,
  ruby: chalk.red,
  rust: chalk.yellowBright,
};

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

interface ServiceDescriptionInfo {
  label: string;
  colorFn: (text: string) => string;
}

function getServiceDescriptionInfo(
  service: ResolvedService
): ServiceDescriptionInfo {
  const frameworkName = getFrameworkName(service.framework);

  // Show the most detailed info: framework > runtime > builder
  if (frameworkName && service.framework) {
    const colorFn = frameworkColors[service.framework] || chalk.cyan;
    return { label: frameworkName, colorFn };
  } else if (service.runtime) {
    const normalizedRuntime = service.runtime.toLowerCase().replace(/@.*$/, '');
    const colorFn = runtimeColors[normalizedRuntime] || chalk.yellow;
    return { label: service.runtime, colorFn };
  } else if (service.builder?.use) {
    return { label: service.builder.use, colorFn: chalk.magenta };
  }
  return { label: 'unknown', colorFn: chalk.dim };
}

function getServiceTarget(service: ResolvedService): string {
  switch (service.type) {
    case 'cron':
      return `schedule: ${service.schedule ?? 'none'}`;
    case 'worker':
      return `topic: ${service.topic ?? 'none'}`;
    default:
      return service.routePrefix
        ? formatRoutePrefix(service.routePrefix)
        : 'no route';
  }
}

/**
 * Output format:
 * Multiple services detected. Project Settings:
 *   frontend          [Next.js]   →  /
 *   api               [python]    →  /api/*
 *   cleanup           [node]      →  schedule: 0 0 * * *
 *   processor         [node]      →  topic: jobs
 */
export function displayDetectedServices(services: ResolvedService[]): void {
  output.print(`Multiple services detected. Project Settings:\n`);

  const rows: string[][] = services.map(service => {
    const descInfo = getServiceDescriptionInfo(service);
    const target = getServiceTarget(service);

    return [
      `• ${service.name}`,
      descInfo.colorFn(`[${descInfo.label}]`),
      chalk.dim('→'),
      target,
    ];
  });

  const tableOutput = table(rows, { align: ['l', 'l', 'l', 'l'], hsep: 2 });
  output.print(`${tableOutput}\n`);
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
