import type Client from '../client';
import output from '../../output-manager';

export type RepoLinkPreflightReason =
  | 'login_connection_missing'
  | 'repo_not_found'
  | 'repo_no_access'
  | 'app_not_installed';

export interface RepoLinkPreflight {
  provider: string;
  repo: string;
  canLink: boolean;
  reason?: RepoLinkPreflightReason;
  message?: string;
  viewerCanWrite?: boolean;
  /** Whether the GitHub App covers this specific repo. */
  appInstalled?: boolean;
  /**
   * Whether the App is installed anywhere on the user's account. Separates
   * "never installed it" from "installed, but not on this repo" — states that
   * `appInstalled` alone collapses into `false`.
   */
  hasVercelAppInstalled?: boolean;
  action?: { label: string; link: string };
}

/** Providers the preflight endpoint understands. */
const SUPPORTED_PROVIDERS = new Set(['github']);

export function supportsPreflight(provider: string): boolean {
  return SUPPORTED_PROVIDERS.has(provider);
}

/**
 * Asks the API whether this repo could be connected, so the prompt can default
 * to the likely answer instead of always guessing "yes".
 *
 * Returns `null` when the answer is unknown — unsupported provider, or any
 * failure. Callers must treat that as "no signal" rather than "no": this is a
 * prompt default, and a preflight outage should never block linking.
 */
export async function fetchRepoLinkPreflight(
  client: Client,
  { provider, org, repo }: { provider: string; org: string; repo: string }
): Promise<RepoLinkPreflight | null> {
  if (!supportsPreflight(provider)) {
    return null;
  }

  const query = new URLSearchParams({ type: provider, repo: `${org}/${repo}` });

  try {
    return await client.fetch<RepoLinkPreflight>(
      `/v1/integrations/repo-link-preflight?${query}`,
      { json: true }
    );
  } catch (error) {
    output.debug(`Repo link preflight failed: ${error}`);
    return null;
  }
}
