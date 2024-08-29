import chalk from 'chalk';
import Client from '../client';
import type { LinkOptions } from '../output/create-output';

export function formatProject(
  client: Client,
  orgSlug: string,
  projectSlug: string,
  options?: LinkOptions
) {
  const orgProjectSlug = `${orgSlug}/${projectSlug}`;
  const projectUrl = `https://vercel.com/${orgProjectSlug}`;
  const projectSlugLink = client.output.link(
    chalk.bold(orgProjectSlug),
    projectUrl,
    {
      fallback: () => chalk.bold(orgProjectSlug),
      color: false,
      ...options,
    }
  );
  return projectSlugLink;
}
