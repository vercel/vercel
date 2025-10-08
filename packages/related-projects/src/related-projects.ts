import type { VercelRelatedProjects, RelatedProjectsOptions } from './types';

export function relatedProjects(
  opts: RelatedProjectsOptions = {}
): VercelRelatedProjects {
  const val = process.env.VERCEL_RELATED_PROJECTS;

  if (!val) {
    if (opts.noThrow) {
      return [];
    }
    throw new Error(
      'Missing required environment variable: VERCEL_RELATED_PROJECTS'
    );
  }

  try {
    return JSON.parse(val) as VercelRelatedProjects;
  } catch (e) {
    if (opts.noThrow) {
      return [];
    }
    throw new Error(
      `Invalid JSON in VERCEL_RELATED_PROJECTS: ${(e as Error).message}`
    );
  }
}
