import chalk from 'chalk';
import Client from '../client';
import { Project } from '../../types';
import { ProjectNotFound } from '../errors-ts';
import { NowBuildError } from '@vercel/build-utils';

export default async function getProjectByNameOrId(
  client: Client,
  projectNameOrId: string,
  accountId?: string
) {
  try {
    const project = await client.fetch<Project>(
      `/projects/${encodeURIComponent(projectNameOrId)}`,
      { accountId }
    );
    return project;
  } catch (error) {
    if (error.status === 404) {
      return new ProjectNotFound(projectNameOrId);
    }

    if (error.status === 403) {
      throw new NowBuildError({
        message: `Could not retrieve Project Settings. To link your project again, run ${chalk.gray(
          `\`rm -rf .vercel\``
        )} and ${chalk.gray(`\`vercel\``)}.`,
        code: 'PROJECT_UNAUTHORIZED',
        link: 'https://vercel.link/cannot-load-project-settings',
      });
    }

    throw error;
  }
}
