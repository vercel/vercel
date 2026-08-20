import { getPlatformEnv } from '@vercel/build-utils';
import type Client from '../client';
import getTeams from './get-teams';
import getUser from '../get-user';
import output from '../../output-manager';

export type TeamEnvVarName = 'VERCEL_TEAM' | 'VERCEL_ORG_ID';

export interface TeamEnvVar {
  name: TeamEnvVarName;
  value: string;
}

/**
 * Thrown when `VERCEL_TEAM` names a team that this account can't see.
 * `VERCEL_ORG_ID` is never looked up (it stays an opaque ID), so this can only
 * originate from `VERCEL_TEAM`.
 */
export class TeamEnvNotFound extends Error {
  constructor(value: string) {
    super(
      `The team specified by \`VERCEL_TEAM\` ("${value}") was not found. Set it to a team slug or ID you have access to.`
    );
    this.name = 'TeamEnvNotFound';
  }
}

/**
 * Raw `VERCEL_TEAM` value (a team ID *or* a team slug), if set.
 *
 * Read directly instead of through `getPlatformEnv()`: the `NOW_` fallback in
 * that helper exists for env vars that predate the Now → Vercel rename, and
 * `VERCEL_TEAM` is new.
 */
export function getTeamEnv(): string | undefined {
  return process.env.VERCEL_TEAM || undefined;
}

/**
 * The team/scope selected through the environment, if any.
 *
 * `VERCEL_TEAM` is the preferred variable and accepts either a team ID
 * (`team_…`) or a team slug, mirroring Turborepo's `TURBO_TEAM`.
 * `VERCEL_ORG_ID` is the original name; it only ever accepted an ID and keeps
 * working unchanged, indefinitely.
 *
 * Precedence: `VERCEL_TEAM` wins when both are set. It is the newer and more
 * deliberate of the two — CI environments commonly inherit `VERCEL_ORG_ID`
 * from shared/organization-level configuration, so the variable a user just
 * added should be the one that takes effect. It is also the only option that
 * can't fail: requiring the two to agree would turn a half-finished migration
 * into a broken build.
 */
export function getTeamEnvVar(): TeamEnvVar | undefined {
  const team = getTeamEnv();
  if (team) {
    return { name: 'VERCEL_TEAM', value: team };
  }

  const orgId = getPlatformEnv('ORG_ID');
  if (orgId) {
    return { name: 'VERCEL_ORG_ID', value: orgId };
  }

  return undefined;
}

/**
 * Resolves the env-selected team to an org ID — a `team_…` ID, or the user ID
 * for a personal account — looking the value up only when it can't already be
 * an ID.
 *
 * Returns `undefined` when neither variable is set.
 *
 * @throws {TeamEnvNotFound} when a `VERCEL_TEAM` value matches no team.
 */
export async function getOrgIdFromEnv(
  client: Client
): Promise<string | undefined> {
  const envVar = getTeamEnvVar();
  if (!envVar) {
    return undefined;
  }

  // `VERCEL_ORG_ID` has always been used verbatim as an opaque ID. Keep it
  // that way so existing setups gain neither an API call nor a failure mode.
  if (envVar.name === 'VERCEL_ORG_ID') {
    output.debug(
      '`VERCEL_ORG_ID` is set. `VERCEL_TEAM` is the preferred env var and also accepts a team slug.'
    );
    return envVar.value;
  }

  if (envVar.value.startsWith('team_')) {
    return envVar.value;
  }

  // A slug (or the user's own identity) has to be resolved through the API.
  // This is the same team list `--scope` resolution uses, and it's memoized
  // per `Client`, so repeated calls within one invocation are free.
  const teams = await getTeams(client);
  const team = teams.find(
    t => t.id === envVar.value || t.slug === envVar.value
  );
  if (team) {
    return team.id;
  }

  // `VERCEL_ORG_ID` also accepts a personal account (a user ID), so
  // `VERCEL_TEAM` resolves the user's own identity too.
  const user = await getUser(client);
  if (
    user.id === envVar.value ||
    user.email === envVar.value ||
    user.username === envVar.value
  ) {
    return user.id;
  }

  throw new TeamEnvNotFound(envVar.value);
}
