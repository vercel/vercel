import { NowBuildError, getPlatformEnv } from '@vercel/build-utils';

/**
 * `teamId` is accepted everywhere `orgId` is: in `.vercel/project.json`,
 * in `.vercel/repo.json`, and as the `VERCEL_TEAM_ID` env var (an alias for
 * `VERCEL_ORG_ID`). Internally the CLI keeps using `orgId`, and it still
 * writes `orgId` so older CLI versions can read the files it creates.
 */

/**
 * Resolves the owner ID from `orgId` and its `teamId` alias.
 * Throws when both are set to different values.
 */
export function resolveOrgIdAlias(
  orgId: unknown,
  teamId: unknown,
  source: string
): unknown {
  if (
    typeof orgId === 'string' &&
    typeof teamId === 'string' &&
    orgId !== teamId
  ) {
    throw new Error(
      `${source} has conflicting "orgId" and "teamId" values. Remove one of them.`
    );
  }
  return orgId ?? teamId;
}

/**
 * Copies a `teamId` alias onto `orgId` in place, so the rest of the CLI can
 * keep reading `orgId`.
 */
export function normalizeTeamIdAlias<T>(value: T, source: string): T {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (raw.teamId === undefined) {
    return value;
  }
  const orgId = resolveOrgIdAlias(raw.orgId, raw.teamId, source);
  if (orgId !== undefined) {
    raw.orgId = orgId;
  }
  return value;
}

/**
 * Name of the env var that supplied the owner ID, preferring
 * `VERCEL_TEAM_ID` over `VERCEL_ORG_ID`.
 */
export function getOrgIdEnvName(): 'VERCEL_TEAM_ID' | 'VERCEL_ORG_ID' {
  return getPlatformEnv('TEAM_ID') ? 'VERCEL_TEAM_ID' : 'VERCEL_ORG_ID';
}

/**
 * Reads the owner ID from `VERCEL_TEAM_ID` or `VERCEL_ORG_ID`.
 * Throws when both are set to different values.
 */
export function getOrgIdFromEnv(): string | undefined {
  const teamId = getPlatformEnv('TEAM_ID');
  const orgId = getPlatformEnv('ORG_ID');
  if (teamId && orgId && teamId !== orgId) {
    throw new NowBuildError({
      code: 'CONFLICTING_ENV_VAR_VALUES',
      message:
        'Both "VERCEL_TEAM_ID" and "VERCEL_ORG_ID" env vars are defined with different values. Please only define "VERCEL_TEAM_ID".',
    });
  }
  return teamId || orgId;
}
