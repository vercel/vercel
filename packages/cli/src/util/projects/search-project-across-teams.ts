import type Client from '../client';
import type { Project, Org, Team } from '@vercel-internals/types';
import getTeams from '../teams/get-teams';
import getProjectByIdOrName from './get-project-by-id-or-name';
import { ProjectNotFound } from '../errors-ts';
import slugify from '@sindresorhus/slugify';
import output from '../../output-manager';
import { join, relative } from 'path';
import {
  fetchProjectsForRepoUrl,
  findProjectsFromPath,
  findRepoRoot,
  resolveGitRemote,
  type ResolvedGitRemote,
} from '../link/repo';
import { isPromptCanceledError } from '../input/prompt-cancellation';
import { getRemoteUrls } from '../create-git-meta';
import { getGitConfigPath } from '../git-helpers';

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

export interface RepoRootSearchResult {
  matches: CrossTeamMatch[];
  /** Remote used for the `/v9/projects?repoUrl=` query, when one resolved. */
  remote?: ResolvedGitRemote;
  /**
   * All remotes in the repo. Length > 1 means the project picker can offer
   * "Switch Git remote" so the user can change what the suggestions came from
   * without being asked before they see the list.
   */
  remoteNames: string[];
}

export default async function searchProjectAcrossTeams(
  client: Client,
  projectName: string,
  cwd: string,
  {
    teams,
    skipLimited,
    gitProjectName,
  }: {
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

  const [repoSearch, folderNameMatches] = await Promise.all([
    repoMatchesPromise,
    Promise.all(folderNameSearchPromises),
  ]);

  const results = [...repoSearch.matches, ...folderNameMatches];

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

export async function searchProjectsByRepoRoot({
  client,
  cwd,
  gitProjectName,
  orgs,
  remoteName,
}: {
  client: Client;
  cwd: string;
  gitProjectName?: string;
  orgs: Org[];
  /** When set, search this remote instead of the default (`origin` / first). */
  remoteName?: string;
}): Promise<RepoRootSearchResult> {
  const empty: RepoRootSearchResult = { matches: [], remoteNames: [] };
  const rootPath = await findRepoRoot(cwd);
  if (!rootPath) {
    return empty;
  }

  const gitConfigPath =
    getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
  const remoteUrls = await getRemoteUrls(gitConfigPath);
  const remoteNames = remoteUrls ? Object.keys(remoteUrls).sort() : [];

  let remote: ResolvedGitRemote | undefined;
  try {
    // Suggestion search only decides what to *show* in the project picker.
    // Never block on remote disambiguation here — pick the default remote
    // (`origin` when present, else the first), or the remote the user chose
    // via "Switch Git remote". `--project` used to be the only escape hatch
    // because it skips this search entirely.
    remote = await resolveGitRemote(client, rootPath, {
      yes: true,
      existingRemoteName: remoteName,
    });
  } catch (error) {
    if (isPromptCanceledError(error)) {
      throw error;
    }
    output.debug(`Failed to resolve Git remote for project search: ${error}`);
    return { matches: [], remoteNames };
  }

  if (!remote) {
    return { matches: [], remoteNames };
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
        if (isPromptCanceledError(error)) {
          throw error;
        }
        output.debug(
          `Failed to search Git-linked projects under ${org.slug}: ${error}`
        );
        return [];
      }
    })
  );

  return {
    matches: results.flat(),
    remote,
    remoteNames,
  };
}
