import chalk from 'chalk';
import type Client from '../client';
import type { ProjectAliasTarget } from '@vercel-internals/types';
import { isAPIError } from '../errors-ts';
import output from '../../output-manager';

export async function addDomainToProject(
  client: Client,
  projectNameOrId: string,
  domain: string
) {
  output.spinner(
    `Adding domain ${domain} to project ${chalk.bold(projectNameOrId)}`
  );
  try {
    const response = await client.fetch<ProjectAliasTarget[]>(
      `/projects/${encodeURIComponent(projectNameOrId)}/alias`,
      {
        method: 'POST',
        body: JSON.stringify({
          target: 'PRODUCTION',
          domain,
        }),
      }
    );

    const aliasTarget: ProjectAliasTarget | undefined = response.find(
      aliasTarget => aliasTarget.domain === domain
    );

    if (!aliasTarget) {
      throw new Error(
        `Unexpected error when adding the domain "${domain}" to project "${projectNameOrId}".`
      );
    }

    return aliasTarget;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}
