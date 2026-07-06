import type Client from '../client';
import { isAPIError } from '../errors-ts';
import type { Project } from '@vercel-internals/types';
import type { ProjectDomain } from './get-project-domain';

/**
 * Finds the projects that have a domain (or one of its subdomains) assigned,
 * by paginating the domain's project-domains and resolving each referenced
 * project. This stays proportional to the domain's own usage instead of
 * scanning every project in the account.
 */
export async function findProjectsForDomain(
  client: Client,
  domainName: string
): Promise<Project[] | Error> {
  try {
    const projectIds = new Set<string>();

    for await (const chunk of client.fetchPaginated<{
      projectDomains: ProjectDomain[];
    }>(`/v1/domains/${encodeURIComponent(domainName)}/project-domains`)) {
      for (const projectDomain of chunk.projectDomains) {
        projectIds.add(projectDomain.projectId);
      }
    }

    const result: Project[] = [];

    for (const projectId of projectIds) {
      result.push(
        await client.fetch<Project>(
          `/v9/projects/${encodeURIComponent(projectId)}`
        )
      );
    }

    return result;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}
