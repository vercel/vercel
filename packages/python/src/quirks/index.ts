import { debug } from '@vercel/build-utils';
import {
  normalizePackageName,
  scanDistributions,
} from '@vercel/python-analysis';
import { getVenvSitePackagesDirs } from '../install';
import { litellmQuirk } from './litellm';
import { prismaQuirk } from './prisma';

export interface QuirkContext {
  venvPath: string;
  pythonEnv: NodeJS.ProcessEnv;
  workPath: string;
}

export interface QuirkResult {
  /** Env vars to set on the Lambda runtime (lambdaEnv) */
  env?: Record<string, string>;
  /** Env vars to set for subsequent build steps */
  buildEnv?: Record<string, string>;
  /** Packages that must always be bundled (never externalized) */
  alwaysBundlePackages?: string[];
}

export interface Quirk {
  dependency: string;
  /** Quirks (by dependency name) this quirk must run before */
  runsBefore?: string[];
  /** Quirks (by dependency name) that must run before this quirk */
  runsAfter?: string[];
  run(ctx: QuirkContext): Promise<QuirkResult>;
}

const quirks: Quirk[] = [litellmQuirk, prismaQuirk];

/**
 * Topologically sort activated quirks based on runsBefore/runsAfter edges.
 * Uses Kahn's algorithm. Throws on cycles.
 */
export function toposortQuirks(activated: Quirk[]): Quirk[] {
  const nameToQuirk = new Map<string, Quirk>();
  for (const q of activated) {
    nameToQuirk.set(normalizePackageName(q.dependency), q);
  }

  // Build adjacency list and in-degree map
  const adj = new Map<Quirk, Set<Quirk>>();
  const inDegree = new Map<Quirk, number>();
  for (const q of activated) {
    adj.set(q, new Set());
    inDegree.set(q, 0);
  }

  for (const q of activated) {
    // runsBefore: ['X'] → edge from q to X (q runs first)
    if (q.runsBefore) {
      for (const dep of q.runsBefore) {
        const target = nameToQuirk.get(normalizePackageName(dep));
        if (target) {
          adj.get(q)!.add(target);
          inDegree.set(target, inDegree.get(target)! + 1);
        }
      }
    }
    // runsAfter: ['X'] → edge from X to q (X runs first)
    if (q.runsAfter) {
      for (const dep of q.runsAfter) {
        const source = nameToQuirk.get(normalizePackageName(dep));
        if (source) {
          adj.get(source)!.add(q);
          inDegree.set(q, inDegree.get(q)! + 1);
        }
      }
    }
  }

  // Kahn's algorithm
  const queue: Quirk[] = [];
  for (const q of activated) {
    if (inDegree.get(q) === 0) {
      queue.push(q);
    }
  }

  const sorted: Quirk[] = [];
  while (queue.length > 0) {
    const q = queue.shift()!;
    sorted.push(q);
    for (const neighbor of adj.get(q)!) {
      const deg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== activated.length) {
    const unsorted = activated
      .filter(q => !sorted.includes(q))
      .map(q => q.dependency);
    throw new Error(
      `Circular dependency detected among quirks: ${unsorted.join(', ')}`
    );
  }

  return sorted;
}

export async function runQuirks(ctx: QuirkContext): Promise<QuirkResult> {
  const mergedEnv: Record<string, string> = {};
  const mergedBuildEnv: Record<string, string> = {};
  const mergedAlwaysBundle: string[] = [];

  // Scan installed distributions once, reuse for all quirks.
  const installedNames = new Set<string>();
  const sitePackageDirs = await getVenvSitePackagesDirs(ctx.venvPath);
  for (const dir of sitePackageDirs) {
    const distributions = await scanDistributions(dir);
    for (const name of distributions.keys()) {
      installedNames.add(normalizePackageName(name));
    }
  }

  // Filter to activated quirks and topologically sort them
  const activated = quirks.filter(quirk => {
    const installed = installedNames.has(
      normalizePackageName(quirk.dependency)
    );
    if (!installed) {
      debug(`Quirk "${quirk.dependency}": not installed, skipping`);
    }
    return installed;
  });

  const sorted = toposortQuirks(activated);

  for (const quirk of sorted) {
    debug(`Quirk "${quirk.dependency}": detected, running fix-up`);
    const result = await quirk.run(ctx);
    if (result.env) {
      Object.assign(mergedEnv, result.env);
    }
    if (result.buildEnv) {
      Object.assign(mergedBuildEnv, result.buildEnv);
      // Propagate buildEnv into process.env so subsequent quirks can read it
      Object.assign(process.env, result.buildEnv);
    }
    if (result.alwaysBundlePackages) {
      mergedAlwaysBundle.push(...result.alwaysBundlePackages);
    }
  }

  return {
    env: mergedEnv,
    buildEnv: mergedBuildEnv,
    alwaysBundlePackages: mergedAlwaysBundle,
  };
}
