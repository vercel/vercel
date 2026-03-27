import type Client from './client';
import { getVercelDirectory, getLinkFromDir } from './projects/link';

/**
 * If `cwd` has a valid `.vercel/project.json` with `orgId`, align
 * `client.config.currentTeam` with that org (team id or cleared for personal).
 * Used so API scope matches the linked directory unless overridden by `--scope`.
 */
export async function applyCwdProjectJsonScopeToClient(
  client: Client,
  cwd: string
): Promise<void> {
  let vercelDir: string;
  try {
    vercelDir = getVercelDirectory(cwd);
  } catch {
    return;
  }

  const link = await getLinkFromDir(vercelDir);
  if (!link?.orgId) {
    return;
  }

  if (link.orgId.startsWith('team_')) {
    client.config.currentTeam = link.orgId;
  } else {
    delete client.config.currentTeam;
  }
}

/**
 * Subcommands where cwd `.vercel/project.json` must not override scope.
 * Matches `--scope` resolution exclusions in `index.ts`, plus `switch`, `logout`,
 * and `init`.
 */
export function commandSkipsCwdProjectJsonScope(
  subcommand: string | undefined,
  subSubCommand: string | undefined
): boolean {
  if (!subcommand) {
    return true;
  }
  if (
    subcommand === 'login' ||
    subcommand === 'logout' ||
    subcommand === 'build' ||
    subcommand === 'switch' ||
    subcommand === 'init'
  ) {
    return true;
  }
  if (subcommand === 'teams' && subSubCommand !== 'invite') {
    return true;
  }
  return false;
}
