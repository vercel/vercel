import type Client from '../client';
import { isAPIError } from '../errors-ts';
import type { Project } from '@vercel-internals/types';
import type { ProjectDomain } from './get-project-domain';

export interface ProjectForDomain {
  project: Project;
  /** Names of the project-domains under the looked-up domain assigned to this project. */
  domains: string[];
}

/**
 * Finds the projects that have a domain (or one of its subdomains) assigned,
 * by paginating the domain's project-domains and resolving each referenced
 * project. This stays proportional to the domain's own usage instead of
 * scanning every project in the account.
 *
 * Each project carries the project-domain names that referenced it, since
 * non-production assignments (e.g. branch domains) are not visible on the
 * project's production alias list.
 */
export async function findProjectsForDomain(
  client: Client,
  domainName: string
): Promise<ProjectForDomain[] | Error> {
  try {
    const domainsByProjectId = new Map<string, string[]>();

    for await (const chunk of client.fetchPaginated<{
      projectDomains: ProjectDomain[];
    }>(`/v1/domains/${encodeURIComponent(domainName)}/project-domains`)) {
      for (const projectDomain of chunk.projectDomains) {
        const domains = domainsByProjectId.get(projectDomain.projectId) ?? [];
        domains.push(projectDomain.name);
        domainsByProjectId.set(projectDomain.projectId, domains);
      }
    }

    const result: ProjectForDomain[] = [];

    for (const [projectId, domains] of domainsByProjectId) {
      try {
        const project = await client.fetch<Project>(
          `/v9/projects/${encodeURIComponent(projectId)}`
        );
        result.push({ project, domains });
      } catch (err: unknown) {
        // A stale project-domain reference or a token without access to this
        // particular project must not fail the whole lookup: the old
        // all-projects scan simply did not surface projects it could not read.
        if (isAPIError(err) && err.status < 500) {
          continue;
        }

        throw err;
      }
    }

    return result;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}
