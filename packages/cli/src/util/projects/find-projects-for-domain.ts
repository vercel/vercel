import type Client from '../client';
import { isAPIError } from '../errors-ts';
import type { Project } from '@vercel-internals/types';

export async function findProjectsForDomain(
  client: Client,
  domainName: string
): Promise<Project[] | Error> {
  try {
    const result: Project[] = [];

    for await (const chunk of client.fetchPaginated<{ projects: Project[] }>(
      '/v9/projects'
    )) {
      for (const project of chunk.projects) {
        if (
          project.targets?.production?.alias?.some?.(alias =>
            alias.endsWith(domainName)
          )
        ) {
          result.push(project);
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
