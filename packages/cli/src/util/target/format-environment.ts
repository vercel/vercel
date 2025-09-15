import chalk from 'chalk';
import output from '../../output-manager';
import type {
  CustomEnvironment,
  CustomEnvironmentType,
} from '@vercel-internals/types';
import { STANDARD_ENVIRONMENTS } from './standard-environments';
import title from 'title';

export function formatEnvironment(
  orgSlug: string,
  projectSlug: string,
  environment: Pick<CustomEnvironment, 'slug' | 'id'>
) {
  const projectUrl = `https://vercel.com/${orgSlug}/${projectSlug}`;
  const boldName = chalk.bold(
    STANDARD_ENVIRONMENTS.includes(environment.slug as CustomEnvironmentType)
      ? title(environment.slug)
      : environment.slug
  );
  return output.link(
    boldName,
    `${projectUrl}/settings/environments/${environment.slug}`,
    { fallback: () => boldName, color: false }
  );
}
