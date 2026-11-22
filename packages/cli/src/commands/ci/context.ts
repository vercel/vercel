import type Client from '../../util/client';
import { resolveCiTeam } from '../../util/ci/api';
import {
  getCiGitContext,
  getCiGitRemoteNames,
  type CiGitContext,
} from '../../util/ci/git-context';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { selectGitRemote } from '../../util/link/repo';
import { canPromptOnTerminal } from '../../util/can-prompt';
import { failCi, invalidCiArguments } from './errors';

export type CiContext = {
  git: CiGitContext;
  remoteName: string;
  accountId?: string;
};

/**
 * Resolves the Git repository and team for a Vercel CI command, or returns
 * the exit code after reporting why they couldn't be resolved.
 */
export async function resolveCiContext(
  client: Client,
  remoteOptions?: { remote?: string; nonInteractive: boolean }
): Promise<CiContext | number> {
  let remoteName = 'origin';
  if (remoteOptions) {
    const remoteNames = await getCiGitRemoteNames(client.cwd);
    if (remoteOptions.remote !== undefined) {
      if (!remoteNames.includes(remoteOptions.remote)) {
        return invalidCiArguments(
          client,
          "Can't enable Vercel CI. --remote must name an existing Git remote. Run `git remote` to list remotes, then pass --remote <NAME>."
        );
      }
      remoteName = remoteOptions.remote;
    } else if (
      remoteNames.length > 1 &&
      (remoteOptions.nonInteractive || !canPromptOnTerminal(client))
    ) {
      return invalidCiArguments(
        client,
        "Can't enable Vercel CI. Found multiple Git remotes. Pass --remote <NAME> to select one; run `git remote` to list remotes."
      );
    } else if (remoteNames.length > 0) {
      remoteName = await selectGitRemote(client, remoteNames);
    }
  }

  const git = await getCiGitContext(client.cwd, remoteName);
  if (!git) {
    return failCi(client, {
      reason: AGENT_REASON.GIT_REPOSITORY_REQUIRED,
      message: remoteOptions
        ? "Couldn't find a supported Git repository for the selected remote. Vercel CI currently supports GitHub repositories. Run `git remote -v` to check remotes, then pass --remote <NAME>."
        : "Couldn't find a supported Git repository here. Vercel CI currently supports GitHub repositories with an origin remote.",
    });
  }

  const team = await resolveCiTeam(client);
  if (!team.ok) {
    return team.exitCode;
  }

  return { git, remoteName, accountId: team.accountId };
}
