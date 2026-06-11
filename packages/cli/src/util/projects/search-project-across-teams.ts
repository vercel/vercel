import type Client from '../client';
import type { Project, Org, Team } from '@vercel-internals/types';
import getTeams from '../teams/get-teams';
import getUser from '../get-user';
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
  currentTeamId?: string;
  currentTeamSlug?: string;
  otherTeamSearch?: Promise<{
    matches: CrossTeamMatch[];
    searchedTeamSlugs: string[];
  }>;
}

type SearchPhase = 'current-team' | 'other-teams' | 'all-teams';

interface RepoSearchContext {
  remote: ResolvedGitRemote;
  relativePath: string;
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
    onSearchPhase,
  }: {
    autoConfirm?: boolean;
    nonInteractive?: boolean;
    teams?: Team[];
    skipLimited?: boolean;
    gitProjectName?: string;
    onSearchPhase?: (phase: SearchPhase) => void;
  } = {}
): Promise<CrossTeamSearchResult> {
  const [teamsToSearch, user] = await Promise.all([
    teams ? Promise.resolve(teams) : getTeams(client),
    teams ? Promise.resolve(null) : getUser(client),
  ]);
  const currentTeamId = client.config.currentTeam || user?.defaultTeamId;
  const shouldSkipLimited = skipLimited ?? true;

  // Skip "limited" (SAML-enforced) teams here to avoid forcing re-auth
  // during auto-detect. If nothing matches, `setupAndLink` falls through to
  // `selectOrg`, where picking a limited team triggers re-auth deliberately.
  // The active team is still searched first: it is the user's current scope, so
  // preferring it avoids linking to a project in another team just because that
  // slower search happened to finish later.
  const accessibleTeams: typeof teamsToSearch = [];
  const skippedTeams: Team[] = [];
  const skippedSlugs: string[] = [];
  for (const t of teamsToSearch) {
    if (shouldSkipLimited && t.limited && t.id !== currentTeamId) {
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

  const orgs: Org[] = accessibleTeams.map(t => ({
    type: 'team' as const,
    id: t.id,
    slug: t.slug,
  }));
  const currentTeam = currentTeamId
    ? accessibleTeams.find(team => team.id === currentTeamId)
    : undefined;
  const currentTeamOrg = currentTeam
    ? orgs.find(org => org.id === currentTeam.id)
    : undefined;
  const otherOrgs = currentTeamOrg
    ? orgs.filter(org => org.id !== currentTeamOrg.id)
    : orgs;

  const repoSearchContextPromise = getRepoSearchContext({
    client,
    cwd,
    autoConfirm,
    nonInteractive,
  });

  const otherMatchesPromise = searchProjectsForOrgs({
    client,
    projectName,
    gitProjectName,
    orgs: otherOrgs,
    repoSearchContextPromise,
  }).catch(error => {
    output.debug(`Failed to search projects outside current team: ${error}`);
    return [];
  });
  const otherTeamSearch = otherMatchesPromise.then(matches => ({
    matches,
    searchedTeamSlugs: otherOrgs.map(org => org.slug),
  }));

  const searchedTeamSlugs: string[] = [];
  if (currentTeamOrg) {
    onSearchPhase?.('current-team');
    const currentTeamMatches = await searchProjectsForOrgs({
      client,
      projectName,
      gitProjectName,
      orgs: [currentTeamOrg],
      repoSearchContextPromise,
    });
    searchedTeamSlugs.push(currentTeamOrg.slug);

    if (currentTeamMatches.length > 0) {
      // Keep the other-team search running but make this result deterministic.
      void otherMatchesPromise;
      return {
        matches: currentTeamMatches,
        searchedTeamSlugs,
        skippedLimitedTeamSlugs: skippedSlugs,
        skippedLimitedTeams: skippedTeams,
        currentTeamId,
        currentTeamSlug: currentTeamOrg.slug,
        otherTeamSearch,
      };
    }

    onSearchPhase?.('other-teams');
  } else {
    onSearchPhase?.('all-teams');
  }

  const otherTeamResult = await otherTeamSearch;
  searchedTeamSlugs.push(...otherTeamResult.searchedTeamSlugs);

  return {
    matches: otherTeamResult.matches,
    searchedTeamSlugs,
    skippedLimitedTeamSlugs: skippedSlugs,
    skippedLimitedTeams: skippedTeams,
    currentTeamId,
    currentTeamSlug: currentTeamOrg?.slug,
  };
}

async function searchProjectsForOrgs({
  client,
  projectName,
  gitProjectName,
  orgs,
  repoSearchContextPromise,
}: {
  client: Client;
  projectName: string;
  gitProjectName?: string;
  orgs: Org[];
  repoSearchContextPromise: Promise<RepoSearchContext | null>;
}): Promise<CrossTeamMatch[]> {
  if (orgs.length === 0) {
    return [];
  }

  const repoMatchesPromise = searchProjectsByRepoRoot({
    client,
    gitProjectName,
    orgs,
    repoSearchContextPromise,
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

  return matches;
}

async function getRepoSearchContext({
  client,
  cwd,
  autoConfirm,
  nonInteractive,
}: {
  client: Client;
  cwd: string;
  autoConfirm: boolean;
  nonInteractive: boolean;
}): Promise<RepoSearchContext | null> {
  const rootPath = await findRepoRoot(cwd);
  if (!rootPath) {
    return null;
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
    return null;
  }

  if (!remote) {
    return null;
  }

  return { remote, relativePath: relative(rootPath, cwd) };
}

async function searchProjectsByRepoRoot({
  client,
  gitProjectName,
  orgs,
  repoSearchContextPromise,
}: {
  client: Client;
  gitProjectName?: string;
  orgs: Org[];
  repoSearchContextPromise: Promise<RepoSearchContext | null>;
}): Promise<CrossTeamMatch[]> {
  const repoSearchContext = await repoSearchContextPromise;
  if (!repoSearchContext) {
    return [];
  }

  const { remote, relativePath } = repoSearchContext;
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
