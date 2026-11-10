import semver from 'semver';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import {
  installAndActivatePrBinary,
  parsePrTarget,
} from '../../util/native-self-update';
import { installProductionRelease } from '../../util/installer-upgrade';
import {
  CURL_INSTALL_COMMAND,
  getPackageManagerInstallCommand,
  getVersionContext,
  type VersionContext,
} from '../../util/version-context';

function printInstallerOnlyError(context: VersionContext, version?: string) {
  output.error(
    `Switching versions is only supported for installer-managed CLIs.`
  );
  output.log(
    `Install the CLI with the installer first: ${CURL_INSTALL_COMMAND}`
  );
  if (
    version &&
    context.manager === 'package-manager' &&
    context.packageManager !== 'homebrew'
  ) {
    const manager = context.packageManagerAssumed
      ? `${context.packageManager} (assumed)`
      : context.packageManager;
    output.log(
      `Or install this version with ${manager}: ${getPackageManagerInstallCommand(context, version)}`
    );
  }
}

/**
 * `vc version use <version>` installs and activates a production version.
 * It remains eligible for later production auto-updates.
 */
export default async function use(args: string[]): Promise<number> {
  const target = args[0];
  if (!target) {
    output.error(
      `Missing version. Usage: ${getCommandName('version use <version>')}`
    );
    return 2;
  }

  const context = await getVersionContext();
  if (
    context.manager === 'package-manager' &&
    context.upgradeCommand === undefined
  ) {
    output.fatal(context.upgradeError.message);
    return 1;
  }

  // `vc version use latest` installs and activates the latest production
  // release. Only installer-managed CLIs support version switching;
  // `vc upgrade` is left untouched for everyone else.
  if (target === 'latest') {
    if (!context.canSwitchVersions) {
      printInstallerOnlyError(context);
      return 1;
    }
    return installProductionRelease({
      currentVersion: context.version,
      track: context.track,
    });
  }

  // `vc version use pr/115` — install the binary built for a PR.
  // Undocumented on purpose: PR builds are mutable and for internal testing.
  const pr = parsePrTarget(target);
  if (pr !== undefined) {
    if (!context.canSwitchVersions) {
      printInstallerOnlyError(context);
      return 1;
    }
    try {
      const { updated, buildSha, slot } = await installAndActivatePrBinary(pr);
      output.stopSpinner();
      if (updated) {
        output.success(
          `Activated the Vercel CLI build for PR #${pr} (${buildSha.slice(0, 12)}) on pr/${slot}.`
        );
      } else {
        output.log(
          `The latest build for PR #${pr} (${buildSha.slice(0, 12)}) is active on pr/${slot}.`
        );
      }
      output.log(
        `PR builds change on every push — re-run this command to pick up new builds.`
      );
      output.log(
        `Return to a release build with ${getCommandName('version use latest')}.`
      );
      return 0;
    } catch (error) {
      output.stopSpinner();
      output.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  const version = semver.valid(semver.coerce(target)?.version ?? target)
    ? (semver.coerce(target)?.version ?? target)
    : undefined;
  if (!version || !semver.valid(version)) {
    output.error(`Invalid version: "${target}"`);
    return 1;
  }

  if (!context.canSwitchVersions) {
    printInstallerOnlyError(context, version);
    return 1;
  }

  return installProductionRelease({
    version,
    currentVersion: context.version,
    track: context.track,
  });
}
