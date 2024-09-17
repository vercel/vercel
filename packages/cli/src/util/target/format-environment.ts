import chalk from 'chalk';
import type Client from '../client';
import type { CustomEnvironment } from '@vercel-internals/types';

export function formatEnvironment(
  client: Client,
  orgSlug: string,
  projectSlug: string,
  environment: Pick<CustomEnvironment, 'name' | 'id'>
) {
  const { output } = client;
  const projectUrl = `https://vercel.com/${orgSlug}/${projectSlug}`;
  const boldName = chalk.bold(environment.name);
  return output.link(
    boldName,
    `${projectUrl}/settings/environments/${environment.id}`,
    { fallback: () => boldName, color: false }
  );
}
