import type { Project } from '@vercel-internals/types';
import type Client from '../client';
import sleep from '../sleep';

/** Says that `listPausedProjects` couldn't read every project. */
export const PAUSED_PROJECTS_INCOMPLETE =
  "Some paused projects may be missing. More than 100 projects were updated at the same moment, and the API can't list past the first 100 of them.";

/**
 * Lists the paused projects in the current scope, newest update first.
 *
 * The projects API can't filter by `paused` yet, so this reads every page and
 * keeps the paused ones. It stops once it holds `limit` paused projects and
 * has seen one more, so `next` is set only when another page really exists.
 *
 * The API pages by `updatedAt` and its `until` cursor is exclusive, so a page
 * boundary between projects updated at the same moment would skip some of
 * them. Projects paused together often share a timestamp, so this re-reads
 * from the boundary inclusively and never ends a page inside such a group.
 * More than one API page of projects sharing a timestamp can't be read past
 * the first page, so `incomplete` says some paused projects may be missing.
 */
export async function listPausedProjects(
  client: Client,
  opts: {
    limit?: number;
    until?: number;
    search?: string;
    deprecated?: boolean;
  } = {}
): Promise<{
  projects: Project[];
  next: number | null;
  incomplete: boolean;
}> {
  const limit = opts.limit ?? Infinity;
  const query = new URLSearchParams({ limit: '100' });
  if (opts.search) {
    query.set('search', opts.search);
  }
  if (opts.deprecated) {
    query.set('deprecated', 'true');
  }

  const projects: Project[] = [];
  const seen = new Set<string>();
  let until = opts.until;
  let incomplete = false;
  for (;;) {
    if (until) {
      query.set('until', String(until));
    }
    const page = await client.fetch<{
      projects: Project[];
      pagination?: { next: number | null };
    }>(`/v9/projects?${query}`);

    let unseen = 0;
    for (const project of page.projects) {
      if (seen.has(project.id)) {
        continue;
      }
      seen.add(project.id);
      unseen++;
      if (!project.paused) {
        continue;
      }
      if (projects.length >= limit) {
        const last = projects[projects.length - 1];
        if (project.updatedAt !== last.updatedAt) {
          return { projects, next: last.updatedAt, incomplete };
        }
        // End the page before the projects sharing this timestamp, and start
        // the next page at it (`until` is exclusive). When every project here
        // shares it, there's no such boundary, so the page runs past `limit`.
        const first = projects.findIndex(p => p.updatedAt === last.updatedAt);
        if (first > 0) {
          return {
            projects: projects.slice(0, first),
            next: last.updatedAt + 1,
            incomplete,
          };
        }
      }
      projects.push(project);
    }

    const next = page.pagination?.next;
    if (!next) {
      return { projects, next: null, incomplete };
    }
    // Read the next page from the last timestamp inclusively, skipping the
    // projects already seen. If a whole page shares one timestamp, re-reading
    // it finds nothing new: the rest of that group can't be read, so move past
    // it and say so.
    if (unseen > 0) {
      until = next + 1;
    } else {
      until = next;
      incomplete = true;
    }
    // Small sleep to avoid rate limiting, like `client.fetchPaginated`.
    await sleep(100);
  }
}
