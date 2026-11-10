import type { GlobalConfig } from '@vercel-internals/types';
import {
  readGlobalConfigFile,
  writeGlobalConfigFile,
} from '@vercel/cli-config';
import ms from 'ms';
import output from '../../output-manager';
import type Client from '../client';
import { getConfigFilePath } from '../config/files';

/**
 * How long a saved slug is used before the team is looked up again. Requests
 * are scoped by team id, so a stale slug never changes which team a command
 * acts on, but the slug does reach output that agents act on: suggested
 * `--scope <slug>` commands, dashboard URLs, and `contextName` in JSON. The
 * expiry bounds how long a renamed team keeps appearing under its old slug.
 */
export const TEAM_SLUG_TTL_MS = ms('1d');

interface SavedTeamSlug {
  slug: string;
  /** Unix time in milliseconds when the slug was last looked up. */
  savedAt: number;
}

/**
 * Undeclared `cachedTeamSlugs` key the CLI stores in the global config: team
 * id -> saved slug. It stays out of the `GlobalConfig` type for the same
 * reason as `cachedTeamIds` (see `scope-team-cache.ts`).
 */
type GlobalConfigWithTeamSlugs = GlobalConfig & {
  cachedTeamSlugs?: Record<string, unknown>;
};

/**
 * Returns the slug saved for the team, or `undefined` when none is saved, the
 * entry has expired, or it is not in the expected shape.
 */
export function getCachedTeamSlug(
  config: GlobalConfig,
  teamId: string,
  now: number = Date.now()
): string | undefined {
  const saved = (config as GlobalConfigWithTeamSlugs).cachedTeamSlugs?.[teamId];

  if (!isSavedTeamSlug(saved)) {
    return undefined;
  }

  // A `savedAt` in the future means the clock moved; don't trust the entry.
  const age = now - saved.savedAt;
  return age >= 0 && age < TEAM_SLUG_TTL_MS ? saved.slug : undefined;
}

export function setCachedTeamSlug(
  client: Client,
  teamId: string,
  slug: string
): void {
  if (getCachedTeamSlug(client.config, teamId) === slug) {
    return;
  }

  const saved: SavedTeamSlug = { slug, savedAt: Date.now() };
  updateCachedTeamSlugs(client, slugs => ({ ...slugs, [teamId]: saved }));
}

export function forgetCachedTeamSlug(client: Client, teamId: string): void {
  const slugs = (client.config as GlobalConfigWithTeamSlugs).cachedTeamSlugs;
  if (!slugs || !(teamId in slugs)) {
    return;
  }

  updateCachedTeamSlugs(client, saved => {
    const rest = { ...saved };
    delete rest[teamId];
    return rest;
  });
}

function isSavedTeamSlug(value: unknown): value is SavedTeamSlug {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SavedTeamSlug).slug === 'string' &&
    typeof (value as SavedTeamSlug).savedAt === 'number'
  );
}

/**
 * Re-reads the config file and changes only `cachedTeamSlugs`, so invocation
 * overrides held in `client.config` (`--scope`, a linked project's team) are
 * never persisted.
 */
function updateCachedTeamSlugs(
  client: Client,
  update: (slugs: Record<string, unknown>) => Record<string, unknown>
): void {
  try {
    const configPath = getConfigFilePath();
    const savedConfig = readGlobalConfigFile(
      configPath
    ) as GlobalConfigWithTeamSlugs;
    const cachedTeamSlugs = update(savedConfig.cachedTeamSlugs ?? {});
    const config: GlobalConfigWithTeamSlugs = {
      ...savedConfig,
      cachedTeamSlugs,
    };

    writeGlobalConfigFile(configPath, config);
    (client.config as GlobalConfigWithTeamSlugs).cachedTeamSlugs =
      cachedTeamSlugs;
  } catch {
    output.debug('Failed to persist cached team slugs.');
  }
}
