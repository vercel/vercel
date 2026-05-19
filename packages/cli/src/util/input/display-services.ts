import { frameworkList } from '@vercel/frameworks';
import type { Service, ServiceDetectionError } from '@vercel/fs-detectors';
import {
  getServiceQueueTopics,
  isQueueTriggeredService,
  isScheduleTriggeredService,
} from '@vercel/build-utils';
import output from '../../output-manager';
import table from '../output/table';

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

const jobTriggerLabels: Record<string, string> = {
  queue: 'Job/Queue',
  schedule: 'Job/Schedule',
  workflow: 'Job/Workflow',
};

function getServiceDescriptionInfo(service: Service): ServiceDescriptionInfo {
  if (
    service.type === 'worker' ||
    service.type === 'job' ||
    service.type === 'cron'
  ) {
    const typeLabel =
      service.type === 'worker'
        ? 'Worker'
        : (jobTriggerLabels[service.trigger ?? ''] ?? 'Job');
    const typeColorFn = service.type === 'worker' ? chalk.magenta : chalk.cyan;

    if (service.runtime) {
      const runtimeName =
        service.runtime.charAt(0).toUpperCase() + service.runtime.slice(1);
      const runtimeColorFn = runtimeColors[service.runtime] || chalk.yellow;
      const label = `${typeLabel}${chalk.white('/')}${runtimeColorFn(runtimeName)}`;
      return { label, colorFn: typeColorFn };
    }
    return { label: typeLabel, colorFn: typeColorFn };
  }

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

function getServiceTarget(service: Service): string {
  if (isScheduleTriggeredService(service)) {
    return `schedule: ${service.schedule ?? 'none'}`;
  }

  if (isQueueTriggeredService(service)) {
    const topics = getServiceQueueTopics(service);
    return `topics: ${topics.join(', ')}`;
  }

  if (service.type === 'job' && service.trigger === 'workflow') {
    return 'workflow';
  }

  return service.routePrefix
    ? formatRoutePrefix(service.routePrefix)
    : 'no route';
}

/**
 * Output format:
 * Detected services:
 *   frontend          [Next.js]   →  /
 *   api               [python]    →  /api/*
 *   cleanup           [node]      →  schedule: 0 0 * * *
 *   processor         [node]      →  topics: jobs
 */
export function displayDetectedServices(services: Service[]): void {
  output.print(`Detected services:\n`);

  const outputOrder: Record<string, number> = {
    web: 0,
    cron: 1,
    job: 1,
    worker: 2,
  };
  const sorted = [...services].sort(
    (a, b) => (outputOrder[a.type] ?? 3) - (outputOrder[b.type] ?? 3)
  );

  const rows: string[][] = sorted.map(service => {
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

export function displayServicesConfigNote(
  configFileName = 'vercel.json'
): void {
  output.print(
    `\n${chalk.dim(`Services are configured via ${configFileName}.`)}\n`
  );
}

export function displayServiceErrors(errors: ServiceDetectionError[]): void {
  for (const error of errors) {
    output.warn(error.message);
  }
}
