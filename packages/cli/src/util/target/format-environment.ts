import chalk from 'chalk';
import type { CustomEnvironment } from '@vercel-internals/types';
import output from '../../output-manager';
import title from 'title';

export function formatEnvironment(
  orgSlug: string,
  projectSlug: string,
  environment: Pick<CustomEnvironment, 'slug' | 'id'>
) {
  const projectUrl = `https://vercel.com/${orgSlug}/${projectSlug}`;
  const boldName = chalk.bold(title(environment.slug));
  return output.link(
    boldName,
    `${projectUrl}/settings/environments/${environment.id}`,
    { fallback: () => boldName, color: false }
  );
}
