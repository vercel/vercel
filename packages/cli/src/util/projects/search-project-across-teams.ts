import type Client from '../client';
import type { Project, Org } from '@vercel-internals/types';
import getUser from '../get-user';
import getTeams from '../teams/get-teams';
import getProjectByIdOrName from './get-project-by-id-or-name';
import { ProjectNotFound } from '../errors-ts';
import slugify from '@sindresorhus/slugify';

export interface CrossTeamMatch {
  project: Project;
  org: Org;
}

export default async function searchProjectAcrossTeams(
  client: Client,
  projectName: string
): Promise<CrossTeamMatch[]> {
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  const orgs: Org[] = [
    ...(user.version === 'northstar'
      ? []
      : [{ type: 'user' as const, id: user.id, slug: user.username }]),
    ...teams.map(t => ({
      type: 'team' as const,
      id: t.id,
      slug: t.slug,
    })),
  ];

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
