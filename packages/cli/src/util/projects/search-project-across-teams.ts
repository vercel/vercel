import type Client from '../client';
import type { Project, Org, Team } from '@vercel-internals/types';
import getTeams from '../teams/get-teams';
import getProjectByIdOrName from './get-project-by-id-or-name';
import { ProjectNotFound } from '../errors-ts';
import slugify from '@sindresorhus/slugify';
import output from '../../output-manager';
import { relative } from 'path';
import {
  fetchProjectsForRepoUrl,
  findProjectsFromPath,
  findRepoRoot,
  resolveGitRemote,
  type ResolvedGitRemote,
} from '../link/repo';

export interface CrossTeamMatch {
  project: Project;
  org: Org;
  reason: 'repo-root' | 'folder-name';
  repo?: ResolvedGitRemote & {
    directory: string;
  };
}

export interface CrossTeamSearchResult {
  matches: CrossTeamMatch[];
  searchedTeamSlugs: string[];
  skippedLimitedTeamSlugs: string[];
  skippedLimitedTeams: Team[];
}

export default async function searchProjectAcrossTeams(
  client: Client,
  projectName: string,
  cwd: string,
  {
    autoConfirm = false,
    nonInteractive = false,
    teams,
    skipLimited,
    gitProjectName,
  }: {
    autoConfirm?: boolean;
    nonInteractive?: boolean;
    teams?: Team[];
    skipLimited?: boolean;
    gitProjectName?: string;
  } = {}
): Promise<CrossTeamSearchResult> {
  const teamsToSearch = teams ?? (await getTeams(client));
  const shouldSkipLimited = skipLimited ?? true;

  // Skip "limited" (SAML-enforced) teams here to avoid forcing re-auth
  // during auto-detect. If nothing matches, `setupAndLink` falls through to
  // `selectOrg`, where picking a limited team triggers re-auth deliberately.
  const accessibleTeams: typeof teamsToSearch = [];
  const skippedTeams: Team[] = [];
  const skippedSlugs: string[] = [];
  for (const t of teamsToSearch) {
    if (shouldSkipLimited && t.limited) {
      skippedTeams.push(t);
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

  const searchedTeamSlugs = accessibleTeams.map(team => team.slug);
  const orgs: Org[] = accessibleTeams.map(t => ({
    type: 'team' as const,
    id: t.id,
    slug: t.slug,
  }));

  const repoMatchesPromise = searchProjectsByRepoRoot({
    client,
    cwd,
    gitProjectName,
    orgs,
    autoConfirm,
    nonInteractive,
  });

  const slugifiedName = slugify(projectName);
  const searchNames = [projectName];
  if (slugifiedName !== projectName) {
    searchNames.push(slugifiedName);
  }

  const folderNameSearchPromises = orgs.flatMap(org =>
    searchNames.map(name =>
      getProjectByIdOrName(client, name, org.id)
        .then(result =>
          result instanceof ProjectNotFound
            ? null
            : { project: result, org, reason: 'folder-name' as const }
        )
        .catch(() => null)
    )
  );

  const [repoMatches, folderNameMatches] = await Promise.all([
    repoMatchesPromise,
    Promise.all(folderNameSearchPromises),
  ]);

  const results = [...repoMatches, ...folderNameMatches];

  const seen = new Set<string>();
  const matches: CrossTeamMatch[] = [];
  for (const r of results) {
    if (r && r.project.id && !seen.has(r.project.id)) {
      seen.add(r.project.id);
      matches.push(r);
    }
  }

  return {
    matches,
    searchedTeamSlugs,
    skippedLimitedTeamSlugs: skippedSlugs,
    skippedLimitedTeams: skippedTeams,
  };
}

async function searchProjectsByRepoRoot({
  client,
  cwd,
  gitProjectName,
  orgs,
  autoConfirm,
  nonInteractive,
}: {
  client: Client;
  cwd: string;
  gitProjectName?: string;
  orgs: Org[];
  autoConfirm: boolean;
  nonInteractive: boolean;
}): Promise<CrossTeamMatch[]> {
  const rootPath = await findRepoRoot(cwd);
  if (!rootPath) {
    return [];
  }

  let remote: ResolvedGitRemote | undefined;
  try {
    remote = await resolveGitRemote(client, rootPath, {
      yes: autoConfirm || nonInteractive,
    });
  } catch (error) {
    output.debug(
      `Failed to resolve Git remote for cross-team search: ${error}`
    );
    return [];
  }

  if (!remote) {
    return [];
  }

  const relativePath = relative(rootPath, cwd);
  const results = await Promise.all(
    orgs.map(async org => {
      try {
        const projects = await fetchProjectsForRepoUrl(
          client,
          remote.repoUrl,
          org.id
        );
        const repoProjectConfigs = projects
          .filter(
            project =>
              !gitProjectName ||
              project.id === gitProjectName ||
              project.name === gitProjectName
          )
          .map(project => ({
            id: project.id,
            name: project.name,
            directory: project.rootDirectory || '.',
            orgId: org.id,
          }));
        const matchingProjects = findProjectsFromPath(
          repoProjectConfigs,
          relativePath
        );
        return matchingProjects
          .map(match => {
            const project = projects.find(p => p.id === match.id);
            if (!project) {
              return null;
            }
            return {
              project,
              org,
              reason: 'repo-root' as const,
              repo: {
                ...remote,
                directory: match.directory,
              },
            };
          })
          .filter(Boolean) as CrossTeamMatch[];
      } catch (error) {
        output.debug(
          `Failed to search Git-linked projects under ${org.slug}: ${error}`
        );
        return [];
      }
    })
  );

  return results.flat();
}
