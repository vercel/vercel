import type Client from './client';
import {
  NATIVE_BINARY_AUTO_OPT_IN_TEAM_SLUG,
  hasNativeBinaryPreference,
  setUseNativeBinary,
} from './native-binary';
import output from '../output-manager';

/**
 * Auto-opt-in members of the `vercel` team to the native CLI binary.
 *
 * Team slugs are globally unique across the Vercel platform, so matching on
 * the slug is stable without hardcoding a team id. This only writes when the
 * user has no explicit preference yet, so an opt-out via
 * `vercel upgrade --binary false` is always respected. It is best-effort: a
 * failure to persist config must never break the running command.
 */
export function maybeAutoOptInNativeBinary(
  client: Client,
  teamSlug: string | undefined
): void {
  if (teamSlug !== NATIVE_BINARY_AUTO_OPT_IN_TEAM_SLUG) {
    return;
  }

  if (hasNativeBinaryPreference(client.config)) {
    return;
  }

  try {
    setUseNativeBinary(client, true);
  } catch (error) {
    output.debug(
      `Failed to auto-opt-in to the native binary: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
