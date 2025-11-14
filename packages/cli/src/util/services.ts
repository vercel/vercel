import path from 'path';
import fs from 'fs-extra';
import type { Builder, Config as BuilderConfig } from '@vercel/build-utils';
import { NowBuildError } from '@vercel/build-utils';
import type { Route } from '@vercel/routing-utils';
import { frameworkList } from '@vercel/frameworks';
import type { VercelConfig } from './dev/types';

type ServiceInput = {
  type: 'web';
  entry: string;
  prefix?: string;
  framework?: string;
  builder?: string;
  memory?: number;
  maxDuration?: number;
};

function normalizePrefix(prefix?: string): string | undefined {
  if (!prefix) return undefined;
  if (!prefix.startsWith('/')) prefix = '/' + prefix;
  // remove trailing slash except root
  if (prefix.length > 1 && prefix.endsWith('/')) prefix = prefix.slice(0, -1);
  return prefix;
}

function getBuilderFromFramework(framework?: string): string | undefined {
  if (!framework) return undefined;
  const f = frameworkList.find(fr => fr.slug === framework);
  if (f?.useRuntime) return f.useRuntime.use;
  return undefined;
}

async function detectBuilderFromEntry(
  cwd: string,
  entry: string
): Promise<{
  use: string;
  framework?: string;
}> {
  const abs = path.join(cwd, entry);
  const ext = path.extname(abs).toLowerCase();

  if (ext === '.py') {
    // Try to detect fastapi/flask for better DX
    try {
      const content = await fs.readFile(abs, 'utf8');
      if (/\bfastapi\b/.test(content)) {
        return { use: '@vercel/python', framework: 'fastapi' };
      }
      if (/\bflask\b/.test(content)) {
        return { use: '@vercel/python', framework: 'flask' };
      }
    } catch {}
    return { use: '@vercel/python' };
  }

  if (ext === '.go') {
    return { use: '@vercel/go' };
  }

  if (['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'].includes(ext)) {
    // Detect popular Node frameworks by import
    try {
      const content = await fs.readFile(abs, 'utf8');
      if (/(from|require\()\s*['"]express['"]/.test(content)) {
        return { use: '@vercel/express', framework: 'express' };
      }
      if (/(from|require\()\s*['"]hono['"]/.test(content)) {
        return { use: '@vercel/hono', framework: 'hono' };
      }
      if (/(from|require\()\s*['"]fastify['"]/.test(content)) {
        return { use: '@vercel/fastify', framework: 'fastify' };
      }
    } catch {}
    // default Node function
    return { use: '@vercel/node' };
  }

  if (ext === '.rb' || ext === '.ru') {
    return { use: '@vercel/ruby' };
  }

  // Fallback: if unknown, try to infer via extensionless language conventions later
  // For now, throw an error to surface misconfiguration.
  throw new Error(
    `Unsupported service entry extension for "${entry}". Supported: .py, .go, .js/.ts variants, .rb/.ru.`
  );
}

function addFunctionLimits(
  cfg: BuilderConfig,
  entry: string,
  memory?: number,
  maxDuration?: number
): void {
  if (memory == null && maxDuration == null) return;
  cfg.functions = cfg.functions || {};
  cfg.functions[entry] = Object.assign({}, cfg.functions[entry], {
    ...(typeof memory === 'number' ? { memory } : {}),
    ...(typeof maxDuration === 'number' ? { maxDuration } : {}),
  });
}

export async function servicesToBuildsAndRoutes(
  services: ServiceInput[],
  cwd: string
): Promise<{ builds: Builder[]; rewriteRoutes: Route[] }> {
  const builds: Builder[] = [];
  const rewriteRoutes: Route[] = [];

  const normalized = services.map(s => ({
    ...s,
    prefix: normalizePrefix(s.prefix),
  }));

  const prefixes = normalized
    .map(s => s.prefix)
    .filter((p): p is string => Boolean(p));

  // Build alternation for negative lookahead (segment-safe)
  const prefixAlternation = prefixes
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .map(p => `${p}(?:/|$)`) // segment-safe
    .join('|');

  let rootServiceEntry: string | undefined;

  for (const service of normalized) {
    const entry = service.entry.replace(/\\/g, '/');
    const abs = path.join(cwd, entry);
    const exists = await fs.pathExists(abs);
    if (!exists) {
      throw new Error(`Service entry "${entry}" does not exist.`);
    }

    // Determine builder use and framework
    let use = service.builder || getBuilderFromFramework(service.framework);
    let framework = service.framework;
    if (!use) {
      const detected = await detectBuilderFromEntry(cwd, entry);
      use = detected.use;
      framework = framework || detected.framework;
    }

    const config: BuilderConfig = {};
    if (framework) {
      (config as any).framework = framework;
    }

    // For Node server frameworks, hint the output directory so they can locate entrypoint
    if (
      use === '@vercel/express' ||
      use === '@vercel/hono' ||
      use === '@vercel/fastify'
    ) {
      const outDir = path.posix.dirname(entry);
      (config as any).projectSettings = Object.assign(
        {},
        (config as any).projectSettings,
        {
          outputDirectory: outDir,
        }
      );
      // Scope dev matching to the specific service entry rewrite
      (config as any).basePath = `/${entry}`;
    }

    // For Python server frameworks, scope dev matching to the specific service entry rewrite
    if (use === '@vercel/python') {
      (config as any).basePath = `/${entry}`;
    }

    // For Ruby server frameworks, scope dev matching to the specific service entry rewrite
    if (use === '@vercel/ruby') {
      (config as any).basePath = `/${entry}`;
    }

    // Apply per-service function limits
    addFunctionLimits(config, entry, service.memory, service.maxDuration);

    builds.push({
      src: entry,
      use,
      config,
    });

    // Generate rewrite routes
    if (service.prefix) {
      const src = `^${service.prefix}(?:/.*)?$`;
      rewriteRoutes.push({ src, dest: `/${entry}`, check: true });
    } else {
      rootServiceEntry = entry;
    }
  }

  if (rootServiceEntry) {
    const src = prefixes.length ? `^(?!${prefixAlternation}).*` : '^/.*';
    rewriteRoutes.push({ src, dest: `/${rootServiceEntry}`, check: true });
  }

  return { builds, rewriteRoutes };
}

export function validateServices(config: VercelConfig): NowBuildError | null {
  const cfgAny = config as any;
  if (!Array.isArray(cfgAny.services)) {
    return null;
  }

  if (config.builds) {
    return new NowBuildError({
      code: 'SERVICES_AND_BUILDS',
      message:
        'The `services` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
      link: 'https://vercel.link/services-config',
    });
  }

  if (config.functions) {
    return new NowBuildError({
      code: 'SERVICES_AND_FUNCTIONS',
      message:
        'The `services` property cannot be used in conjunction with the `functions` property. Please remove one of them.',
      link: 'https://vercel.link/services-config',
    });
  }

  const services: any[] = cfgAny.services as any[];
  const prefixes: string[] = services
    .map((s: any) => (typeof s.prefix === 'string' ? s.prefix : undefined))
    .filter((p: string | undefined): p is string => Boolean(p));

  const noPrefixCount = services.length - prefixes.length;
  if (noPrefixCount > 1) {
    return new NowBuildError({
      code: 'SERVICES_MULTIPLE_ROOT',
      message:
        'Only one service may omit the `prefix` property. Please ensure at most one root service exists.',
      link: 'https://vercel.link/services-config',
    });
  }

  const seen = new Set<string>();
  for (const p of prefixes) {
    if (seen.has(p)) {
      return new NowBuildError({
        code: 'SERVICES_PREFIX_DUPLICATE',
        message: `Duplicate service prefix detected: "${p}". Service prefixes must be unique.`,
        link: 'https://vercel.link/services-config',
      });
    }
    seen.add(p);
  }

  const normalized = prefixes.map((p: string) =>
    p.endsWith('/') ? p.slice(0, -1) : p
  );
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i];
      const b = normalized[j];
      if (a === b || a.startsWith(b + '/') || b.startsWith(a + '/')) {
        return new NowBuildError({
          code: 'SERVICES_PREFIX_CONFLICT',
          message: `Conflicting service prefixes detected: "${a}" and "${b}" overlap. Please choose non-overlapping prefixes.`,
          link: 'https://vercel.link/services-config',
        });
      }
    }
  }

  return null;
}
