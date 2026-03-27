import { relative } from 'path';
import { normalizePath } from '@vercel/build-utils';
import type Client from './client';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';
import { findProjectsFromPath, getRepoLink } from './link/repo';
import { getVercelDirectory, getLinkFromDir } from './projects/link';

/**
 * Resolves the Vercel scope slug (team slug or personal username) implied by
 * `.vercel` link state for `cwd` (actual working directory) for `vc whoami`.
 *
 * Rules:
 * - If `cwd/.vercel/project.json` exists and has `orgId`, use it.
 * - Else if `cwd` is inside a linked git repo (`repo.json`):
 *   - If `cwd` is the repo root: use the common `orgId` when every listed
 *     project shares one; if any differ or any entry lacks an org, null.
 *   - Else (subfolder): if exactly one `repo.json` project matches this path
 *     (`workPath` / `directory`), use that project's `orgId`.
 * - Otherwise null (caller falls back to default CLI scope).
 */
export default async function resolveWhoamiLinkedScopeSlug(
  client: Client,
  cwd: string
): Promise<string | null> {
  let vercelDir: string;
  try {
    vercelDir = getVercelDirectory(cwd);
  } catch {
    return null;
  }

  const dirLink = await getLinkFromDir(vercelDir);
  if (dirLink?.orgId) {
    return orgIdToSlug(client, dirLink.orgId);
  }

  const repoLink = await getRepoLink(client, cwd);
  if (!repoLink?.repoConfig?.projects?.length) {
    return null;
  }

  const { rootPath, repoConfig } = repoLink;
  const relFromRoot = normalizePath(relative(rootPath, cwd));
  const rel = relFromRoot === '' || relFromRoot === '.' ? '.' : relFromRoot;

  const { projects, orgId: topLevelOrgId } = repoConfig;

  if (rel === '.') {
    if (normalizePath(cwd) !== normalizePath(rootPath)) {
      return null;
    }
    const orgIds = projects.map(p => p.orgId ?? topLevelOrgId);
    if (!orgIds.every((id): id is string => Boolean(id))) {
      return null;
    }
    if (new Set(orgIds).size !== 1) {
      return null;
    }
    return orgIdToSlug(client, orgIds[0]);
  }

  const matches = findProjectsFromPath(projects, rel);
  if (matches.length !== 1) {
    return null;
  }

  const orgId = matches[0].orgId ?? topLevelOrgId;
  if (!orgId) {
    return null;
  }

  return orgIdToSlug(client, orgId);
}

async function orgIdToSlug(
  client: Client,
  orgId: string
): Promise<string | null> {
  if (orgId.startsWith('team_')) {
    const team = await getTeamById(client, orgId);
    return team?.slug ?? null;
  }

  const user = await getUser(client);
  if (user.id !== orgId) {
    return null;
  }
  return user.username || user.email || null;
}
