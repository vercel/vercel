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

/**
 * Like multiple {@link searchProjectAcrossTeams} calls (one per detected root), but loads
 * user/teams once and runs all project lookups in parallel — used by repo link discovery.
 */
export async function searchProjectsForLinkDiscoveryByRoots(
  client: Client,
  roots: Array<{ rootDirectory: string; folderName: string }>
): Promise<Map<string, CrossTeamMatch[]>> {
  const result = new Map<string, CrossTeamMatch[]>();
  if (roots.length === 0) {
    return result;
  }

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

  type TaskOutcome = {
    rootDirectory: string;
    match: CrossTeamMatch | null;
  };

  const tasks: Promise<TaskOutcome>[] = [];

  for (const { rootDirectory, folderName } of roots) {
    const slugifiedName = slugify(folderName);
    const searchNames = [folderName];
    if (slugifiedName !== folderName) {
      searchNames.push(slugifiedName);
    }
    for (const org of orgs) {
      for (const name of searchNames) {
        tasks.push(
          getProjectByIdOrName(client, name, org.id)
            .then(
              (projectResult): TaskOutcome => ({
                rootDirectory,
                match:
                  projectResult instanceof ProjectNotFound
                    ? null
                    : { project: projectResult, org },
              })
            )
            .catch((): TaskOutcome => ({ rootDirectory, match: null }))
        );
      }
    }
  }

  const outcomes = await Promise.all(tasks);

  const seenByRoot = new Map<string, Set<string>>();
  for (const { rootDirectory, match } of outcomes) {
    if (!match?.project.id) continue;
    let seen = seenByRoot.get(rootDirectory);
    if (!seen) {
      seen = new Set();
      seenByRoot.set(rootDirectory, seen);
    }
    if (seen.has(match.project.id)) continue;
    seen.add(match.project.id);
    const list = result.get(rootDirectory) ?? [];
    list.push(match);
    result.set(rootDirectory, list);
  }

  return result;
}
