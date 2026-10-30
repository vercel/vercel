import { execFileAsync } from '../exec-file';
import { getGitExecutable } from '../git-executable';
import { parseRepoUrl } from '../git/connect-git-provider';
import output from '../../output-manager';

// The invocation search API currently indexes GitHub repositories only.
const SUPPORTED_PROVIDERS = ['github'] as const;

export type CiGitProvider = (typeof SUPPORTED_PROVIDERS)[number];

export type CiGitContext = {
  provider: CiGitProvider;
  /** `owner/name` as the Git provider knows it. */
  repository: string;
  /** Current branch, or `undefined` for a detached HEAD. */
  branch?: string;
  /** Full SHA of `HEAD`, or `undefined` when the repository has no commits. */
  commitSha?: string;
};

/** Reads effective remote names, including Git config includes and worktrees. */
export async function getCiGitRemoteNames(cwd: string): Promise<string[]> {
  const git = await getGitExecutable(cwd);
  const names = await readGit(git, cwd, ['remote']);
  return names ? names.split('\n') : [];
}

/**
 * Reads the repository, branch, and `HEAD` commit for `cwd` from local Git.
 * Returns `null` when `cwd` is not a Git repository or the selected remote is
 * not on a supported provider. Defaults to `origin`.
 */
export async function getCiGitContext(
  cwd: string,
  remoteName = 'origin'
): Promise<CiGitContext | null> {
  const git = await getGitExecutable(cwd);

  const [remote, branch, commitSha] = await Promise.all([
    readGit(git, cwd, ['remote', 'get-url', remoteName]),
    readGit(git, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    readGit(git, cwd, ['rev-parse', 'HEAD']),
  ]);
  if (!remote) {
    return null;
  }

  const repo = parseRepoUrl(remote);
  const provider = SUPPORTED_PROVIDERS.find(p => p === repo?.provider);
  if (!repo || !provider) {
    output.debug('Unsupported Git remote for Vercel CI.');
    return null;
  }

  return {
    provider,
    repository: `${repo.org}/${repo.repo}`,
    ...(branch && branch !== 'HEAD' ? { branch } : {}),
    ...(commitSha ? { commitSha } : {}),
  };
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{4,40}$/i;

/**
 * Expands a full or abbreviated commit SHA to its full form using local Git.
 * Returns `null` when the value isn't a hex SHA or Git can't resolve it.
 */
export async function resolveCommitSha(
  cwd: string,
  value: string
): Promise<string | null> {
  const sha = value.trim().toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    return null;
  }
  if (sha.length === 40) {
    return sha;
  }
  const git = await getGitExecutable(cwd);
  const resolved = await readGit(git, cwd, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${sha}^{commit}`,
  ]);
  return resolved ?? null;
}

async function readGit(
  git: string,
  cwd: string,
  args: string[]
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(git, args, { cwd });
    return stdout.trim() || undefined;
  } catch (error) {
    output.debug(`git ${args.join(' ')} failed: ${error}`);
    return undefined;
  }
}
