import { resolve } from 'path';
import type { Project } from '@vercel-internals/types';
import type Client from '../client';
import { withGlobalFlags } from '../agent-output';
import { parseGitConfig, pluckRemoteUrls } from '../create-git-meta';
import { getGitConfigPath } from '../git-helpers';
import { parseRepoUrl } from '../git/connect-git-provider';
import { quoteArg } from '../flags/quote-arg';
import output from '../../output-manager';

const SUPPORTED_PROVIDERS = new Set(['github', 'gitlab', 'bitbucket']);

export type RecommendationDeps = {
  getGitConfigPath: typeof getGitConfigPath;
  parseGitConfig: typeof parseGitConfig;
  fetchProject: (client: Client, project: Project) => Promise<Project>;
  buildCommand: (client: Client, command: string) => string;
};

type RecommendationOptions = {
  alreadyOffered?: boolean;
  deps?: RecommendationDeps;
};

const defaultDeps: RecommendationDeps = {
  getGitConfigPath,
  parseGitConfig,
  fetchProject: (client, project) =>
    client.fetch<Project>(`/v9/projects/${encodeURIComponent(project.id)}`, {
      accountId: project.accountId,
    }),
  buildCommand: (client, command) =>
    withGlobalFlags(client, command, { preserveProject: true }),
};

export async function getGitConnectRecommendation(
  client: Client,
  cwd: string,
  project: Project,
  options: RecommendationOptions = {}
): Promise<string | undefined> {
  const { alreadyOffered = false, deps = defaultDeps } = options;
  try {
    if (project.link || alreadyOffered) return undefined;

    const gitConfigPath = deps.getGitConfigPath({ cwd });
    if (!gitConfigPath) return undefined;

    const gitConfig = await deps.parseGitConfig(gitConfigPath);
    const remoteUrls = gitConfig && pluckRemoteUrls(gitConfig);
    if (!remoteUrls) {
      return undefined;
    }
    const remotes = Object.values(remoteUrls);
    const hasSupportedRemote = remotes.some(remoteUrl => {
      const repo = parseRepoUrl(remoteUrl);
      return repo && SUPPORTED_PROVIDERS.has(repo.provider);
    });
    if (
      !hasSupportedRemote ||
      (client.nonInteractive && remotes.length !== 1)
    ) {
      return undefined;
    }

    const remoteProject = await deps.fetchProject(client, project);
    if (remoteProject.link) return undefined;

    const cwdFlag =
      resolve(cwd) === resolve(client.cwd) ? '' : ` --cwd ${quoteArg(cwd)}`;
    return deps.buildCommand(client, `git connect${cwdFlag}`);
  } catch (error) {
    output.debug(`Failed to resolve Git connection guidance: ${error}`);
    return undefined;
  }
}
