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
 * Only acts on teams already loaded on the client, so it never issues its own
 * API request. Runs only when the user has no explicit preference yet, so an
 * opt-out is always respected and, once persisted, this never runs again.
 */
export function maybeAutoOptInNativeBinary(client: Client): void {
  if (hasNativeBinaryPreference(client.config)) {
    return;
  }

  const teams = client.teams;
  if (!teams?.some(team => team.slug === NATIVE_BINARY_AUTO_OPT_IN_TEAM_SLUG)) {
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
