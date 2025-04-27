import chalk from 'chalk';
import type Client from '../client';
import type { ProjectAliasTarget } from '@vercel-internals/types';
import { isAPIError } from '../errors-ts';
import output from '../../output-manager';

export async function removeDomainFromProject(
  client: Client,
  projectNameOrId: string,
  domain: string
) {
  output.spinner(
    `Removing domain ${domain} from project ${chalk.bold(projectNameOrId)}`
  );
  try {
    const response = await client.fetch<ProjectAliasTarget[]>(
      `/projects/${encodeURIComponent(
        projectNameOrId
      )}/alias?domain=${encodeURIComponent(domain)}`,
      {
        method: 'DELETE',
      }
    );

    return response;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}
