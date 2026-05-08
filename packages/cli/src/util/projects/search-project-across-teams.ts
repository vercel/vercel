import type Client from '../client';
import type { Project, Org } from '@vercel-internals/types';
import getTeams from '../teams/get-teams';
import getProjectByIdOrName from './get-project-by-id-or-name';
import { ProjectNotFound } from '../errors-ts';
import slugify from '@sindresorhus/slugify';
import output from '../../output-manager';

export interface CrossTeamMatch {
  project: Project;
  org: Org;
}

export default async function searchProjectAcrossTeams(
  client: Client,
  projectName: string
): Promise<CrossTeamMatch[]> {
  const teams = await getTeams(client);

  // Skip "limited" (SAML-enforced) teams here to avoid forcing re-auth
  // during auto-detect. If nothing matches, `setupAndLink` falls through to
  // `selectOrg`, where picking a limited team triggers re-auth deliberately.
  const accessibleTeams: typeof teams = [];
  const skippedSlugs: string[] = [];
  for (const t of teams) {
    if (t.limited) {
      skippedSlugs.push(t.slug);
    } else {
      accessibleTeams.push(t);
    }
  }

  if (skippedSlugs.length > 0) {
    output.debug(
      `Skipping limited teams during cross-team project search: ${skippedSlugs.join(', ')}`
    );
  }

  const orgs: Org[] = accessibleTeams.map(t => ({
    type: 'team' as const,
    id: t.id,
    slug: t.slug,
  }));

  const slugifiedName = slugify(projectName);
  const searchNames = [projectName];
  if (slugifiedName !== projectName) {
    searchNames.push(slugifiedName);
  }

  const searchPromises = orgs.flatMap(org =>
    searchNames.map(name =>
      getProjectByIdOrName(client, name, org.id)
        .then(result =>
          result instanceof ProjectNotFound ? null : { project: result, org }
        )
        .catch(() => null)
    )
  );

  const results = await Promise.all(searchPromises);

  const seen = new Set<string>();
  const matches: CrossTeamMatch[] = [];
  for (const r of results) {
    if (r && r.project.id && !seen.has(r.project.id)) {
      seen.add(r.project.id);
      matches.push(r);
    }
  }

  return matches;
}
