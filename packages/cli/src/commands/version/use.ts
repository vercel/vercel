import semver from 'semver';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import { getCommandName, packageName } from '../../util/pkg-name';
import {
  executeNativeSelfUpdate,
  isCurlInstall,
  isLinkedToPrBuild,
  installAndLinkVersion,
  installAndLinkPrBinary,
  listAvailableVersions,
  parsePrTarget,
  setPinnedVersion,
  CURL_INSTALL_COMMAND,
} from '../../util/native-self-update';

/**
 * `vc version use <version>`: pin the CLI to a specific version, installing
 * it first when needed. Only supported for curl-managed installs.
 * `vc version use latest` unpins and installs the latest release.
 */
export default async function use(args: string[]): Promise<number> {
  const target = args[0];
  if (!target) {
    output.error(
      `Missing version. Usage: ${getCommandName('version use <version>')}`
    );
    return 1;
  }

  // `vc version use latest` — unpin and move to the latest release. The
  // self-update path already clears the pin on success. Only supported for
  // installer-managed CLIs; `vc upgrade` is left untouched for everyone else.
  if (target === 'latest') {
    if (!(await isCurlInstall())) {
      output.error(
        `Switching versions is only supported for installer-managed CLIs.`
      );
      output.log(
        `Install the CLI with the installer first: ${CURL_INSTALL_COMMAND}`
      );
      return 1;
    }
    return executeNativeSelfUpdate();
  }

  // `vc version use pr/115` — install the binary built for a PR.
  // Undocumented on purpose: PR builds are mutable and for internal testing.
  const pr = parsePrTarget(target);
  if (pr !== undefined) {
    if (!(await isCurlInstall())) {
      output.error(
        `Switching versions is only supported for installer-managed CLIs.`
      );
      output.log(
        `Install the CLI with the installer first: ${CURL_INSTALL_COMMAND}`
      );
      return 1;
    }
    try {
      const { updated, sha } = await installAndLinkPrBinary(pr);
      await setPinnedVersion(`pr-${pr}`);
      output.stopSpinner();
      if (updated) {
        output.success(
          `Switched to the Vercel CLI build for PR #${pr} (${sha.slice(0, 12)}).`
        );
      } else {
        output.log(
          `Already on the latest build for PR #${pr} (${sha.slice(0, 12)}).`
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
      output.error(
        `Failed to switch to the PR #${pr} build: ${error instanceof Error ? error.message : String(error)}`
      );
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

  if (!(await isCurlInstall())) {
    output.error(
      `Switching versions is only supported for installer-managed CLIs.`
    );
    output.log(
      `Install the CLI with the installer first: ${CURL_INSTALL_COMMAND}`
    );
    output.log(
      `Or install this version with your package manager: npm i -g ${packageName}@${version}`
    );
    return 1;
  }

  // When a PR build is active, `pkg.version` matches the release the PR was
  // built from — but the binary is not that release. Always reinstall so the
  // switch actually unpins the PR build.
  if (version === pkg.version && !(await isLinkedToPrBuild())) {
    output.log(`Already on v${version}.`);
    return 0;
  }

  // Validate the version exists for `vercel` before downloading, so a typo'd
  // version gets a clear error instead of a download failure.
  try {
    const available = await listAvailableVersions(packageName);
    if (!available.includes(version)) {
      output.error(`Version ${version} does not exist.`);
      output.log(
        `Run ${getCommandName('version list')} to see available versions.`
      );
      return 1;
    }
  } catch {
    // Registry lookup failed — let the download attempt surface the error.
  }

  try {
    await installAndLinkVersion(version);
    await setPinnedVersion(version);
    output.stopSpinner();
    output.success(`Switched to Vercel CLI v${version}.`);
    output.log(
      `This version is now pinned — automatic updates are paused until you run ${getCommandName('version use latest')}.`
    );
    return 0;
  } catch (error) {
    output.stopSpinner();
    // `installAndLinkVersion` produces a specific message when no native
    // binary exists for this version/platform (e.g. versions that predate
    // native builds).
    output.error(
      `Failed to switch to v${version}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
}
