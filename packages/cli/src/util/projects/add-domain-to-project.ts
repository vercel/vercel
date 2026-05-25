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
      // Return instead of throw so domains/add can handle non-interactive JSON
      // and avoid bubbling to main() as an "unexpected" error. The API returned
      // 2xx but no matching alias in the body—often empty array or domain already
      // attached elsewhere; use domains inspect or --force if moving from another project.
      return new Error(
        `Adding domain '${domain}' to project '${projectNameOrId}' did not return a matching alias in the API response. ` +
          `The domain may already be on another project—try 'vercel domains add ${domain} ${projectNameOrId} --force' after removing it there, or run 'vercel domains inspect ${domain}'.`
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
