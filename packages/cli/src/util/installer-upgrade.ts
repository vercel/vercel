import semver from 'semver';
import output from '../output-manager';
import pkg from './pkg';
import { getCommandName, packageName } from './pkg-name';
import { getInstallRoot } from './native-install';
import { readActivePointer, type NativeTrack } from './native-install-layout';
import {
  CURL_INSTALL_COMMAND,
  installAndActivateProductionVersion,
  listAvailableVersions,
  resolveLatestNativeVersion,
} from './native-self-update';

export interface InstallProductionReleaseOptions {
  /** A semver version to install. Omit (or pass `latest`) for the latest release. */
  version?: string;
  /**
   * Report a no-op instead of reinstalling when the running production build
   * is already at or above the resolved version. Used by `vc upgrade` without
   * an explicit target.
   */
  skipIfCurrent?: boolean;
  /** Version of the running CLI. Defaults to `package.json`. */
  currentVersion?: string;
  /** Active install track. Read from the install root when omitted. */
  track?: NativeTrack;
}

/**
 * Install and activate a production release for a CLI managed by the Vercel
 * installer. Shared by `vc upgrade` and `vc version use <version|latest>` so
 * both commands validate, install, and report results the same way.
 *
 * Returns the command exit code.
 */
export async function installProductionRelease({
  version: requested,
  skipIfCurrent = false,
  currentVersion = pkg.version,
  track,
}: InstallProductionReleaseOptions = {}): Promise<number> {
  const pinned = requested && requested !== 'latest' ? requested : undefined;
  let version = pinned;
  try {
    output.spinner('Checking for updates…', 0);

    if (pinned) {
      // Validate before downloading so a typo gets a clear error instead of a
      // "no native binary" download failure. If the lookup itself fails, let
      // the download surface the error.
      const available = await listAvailableVersions(packageName).catch(
        () => undefined
      );
      if (available && !available.includes(pinned)) {
        output.stopSpinner();
        output.error(`Version ${pinned} does not exist.`);
        output.log(
          `Run ${getCommandName('version list')} to see available versions.`
        );
        return 1;
      }
    } else {
      version = await resolveLatestNativeVersion();
    }
    const target = version as string;

    const activeTrack =
      track ??
      (await readActivePointer(getInstallRoot()).catch(() => undefined))?.track;
    // A PR build reports an unrelated version, so leaving it is always a
    // switch back to production, never a no-op or a downgrade.
    const onPrTrack = activeTrack === 'pr';
    const current =
      !onPrTrack && semver.valid(currentVersion) ? currentVersion : undefined;

    if (skipIfCurrent && current && semver.gte(current, target)) {
      output.stopSpinner();
      output.log(
        `No upgrade available. Vercel CLI is already up to date (v${current}).`
      );
      return 0;
    }

    await installAndActivateProductionVersion(target);
    output.stopSpinner();

    if (!current || semver.gt(target, current)) {
      output.success(`Upgraded Vercel CLI to v${target}.`);
    } else {
      output.success(`Vercel CLI v${target} is active.`);
      if (semver.lt(target, current)) {
        output.warn(
          `Older CLI versions can replace the installer-managed links when running version commands. If that happens, restore the bounded slot layout with:\n  ${CURL_INSTALL_COMMAND}`
        );
      }
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    const reason = error instanceof Error ? error.message : String(error);
    output.fatal(
      version
        ? `Failed to install Vercel CLI v${version}: ${reason}`
        : `Failed to resolve the latest Vercel CLI version: ${reason}`
    );
    output.log(
      `To reinstall the CLI manually, run:\n  ${CURL_INSTALL_COMMAND}`
    );
    return 1;
  }
}
