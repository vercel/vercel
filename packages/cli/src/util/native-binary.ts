import type { GlobalConfig } from '@vercel-internals/types';
import type Client from './client';
import { writeToConfigFile } from './config/files';

/**
 * Slug of the Vercel team whose members are auto-opted-in to the native
 * binary. Team slugs are globally unique across the Vercel platform, so this
 * is stable without hardcoding a team id into the source.
 */
export const NATIVE_BINARY_AUTO_OPT_IN_TEAM_SLUG = 'vercel';

export function isNativeBinaryEnabled(config: GlobalConfig): boolean {
  return config.useNativeBinary === true;
}

export function hasNativeBinaryPreference(config: GlobalConfig): boolean {
  return typeof config.useNativeBinary === 'boolean';
}

export function setUseNativeBinary(client: Client, enabled: boolean): void {
  client.config = {
    ...client.config,
    useNativeBinary: enabled,
  };

  writeToConfigFile(client.config);
}
