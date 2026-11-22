import type { GlobalConfig } from '@vercel-internals/types';
import { writeToConfigFile } from '../config/files';
import type Client from '../client';

/**
 * Undeclared `cachedTeamIds` key the CLI stores in the global config: scope
 * string -> team id. It stays out of the `GlobalConfig` type because the
 * schema generator cannot produce record schemas, and the global config
 * schema is passthrough, so the key survives reads and writes (covered by
 * cli-config's global-config-passthrough test).
 */
export type GlobalConfigWithScopeCache = GlobalConfig & {
  cachedTeamIds?: Record<string, string>;
};

/**
 * Reads the persisted `--scope` -> team id cache. A hit means this exact
 * scope string previously resolved to a team on this machine, so the
 * dispatcher can apply it without the user/teams lookups. Team ids are
 * immutable; a stale entry (left team, recycled slug) surfaces as the
 * command's own authorization error, the same end state as the direct
 * lookup path.
 */
export function getCachedScopeTeamId(
  config: GlobalConfig,
  scope: string
): string | undefined {
  return (config as GlobalConfigWithScopeCache).cachedTeamIds?.[scope];
}

/**
 * Persists a scope resolution and applies it to the current config. Only
 * called with team resolutions; scopes that resolved to the personal
 * account are never cached.
 *
 * The payload resets `currentTeam` to `persistedTeamId`, the team that was
 * on disk before this invocation's `--scope` was applied. `--scope` is a
 * per-invocation override, but `client.config.currentTeam` already points
 * at the scoped team by this point, so writing the config wholesale would
 * make the override sticky for later non-scoped commands.
 */
export function setCachedScopeTeamId(
  client: Client,
  scope: string,
  teamId: string,
  persistedTeamId: string | undefined
): void {
  if (getCachedScopeTeamId(client.config, scope) === teamId) {
    return;
  }

  const config = client.config as GlobalConfigWithScopeCache;
  config.cachedTeamIds = {
    ...config.cachedTeamIds,
    [scope]: teamId,
  };
  writeToConfigFile({ ...config, currentTeam: persistedTeamId });
}
