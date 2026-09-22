import type Client from '../client';
import { isAPIError } from '../errors-ts';
import type { Project } from '@vercel-internals/types';
import type { ProjectDomain } from './get-project-domain';

export interface ProjectForDomain {
  project: Project;
  /** Names of the project-domains under the looked-up domain assigned to this project. */
  domains: string[];
}

/** Bounds concurrent project fetches so heavily-assigned domains resolve quickly without request bursts. */
const PROJECT_FETCH_BATCH_SIZE = 10;

/**
 * Walks the domain's project-domains and groups the assignment names by the
 * project they are assigned to. Work is proportional to the domain's own
 * usage instead of the number of projects in the account.
 */
async function getDomainAssignmentsByProject(
  client: Client,
  domainName: string
): Promise<Map<string, string[]>> {
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

  return domainsByProjectId;
}

/**
 * Counts the projects that have the domain (or one of its subdomains)
 * assigned, without resolving the project records themselves.
 */
export async function countProjectsForDomain(
  client: Client,
  domainName: string
): Promise<number | Error> {
  try {
    const assignments = await getDomainAssignmentsByProject(client, domainName);
    return assignments.size;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}

/**
 * Finds the projects that have a domain (or one of its subdomains) assigned,
 * by paginating the domain's project-domains and resolving each referenced
 * project.
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
    const assignments = Array.from(
      await getDomainAssignmentsByProject(client, domainName)
    );

    const result: ProjectForDomain[] = [];

    for (let i = 0; i < assignments.length; i += PROJECT_FETCH_BATCH_SIZE) {
      const batch = await Promise.all(
        assignments
          .slice(i, i + PROJECT_FETCH_BATCH_SIZE)
          .map(async ([projectId, domains]) => {
            try {
              const project = await client.fetch<Project>(
                `/v9/projects/${encodeURIComponent(projectId)}`
              );
              return { project, domains };
            } catch (err: unknown) {
              // A stale project-domain reference or a token without access to
              // this particular project must not fail the whole lookup: the
              // old all-projects scan simply did not surface projects it
              // could not read.
              if (isAPIError(err) && err.status < 500) {
                return null;
              }

              throw err;
            }
          })
      );

      for (const entry of batch) {
        if (entry) {
          result.push(entry);
        }
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
