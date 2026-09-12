import chalk from 'chalk';
import output from '../../output-manager';
import {
  CURL_INSTALL_COMMAND,
  getVersionContext,
} from '../../util/version-context';
import { listInstalledVersions } from '../../util/native-self-update';

/**
 * `vc version installed`: versions managed under the platform data directory for
 * installer-managed CLIs; for package manager installs just report the current one.
 */
export default async function installed(): Promise<number> {
  const context = await getVersionContext();

  if (context.manager !== 'installer') {
    const manager = context.packageManagerAssumed
      ? `${context.packageManager} (assumed)`
      : context.packageManager;
    output.print(`${context.version} ${chalk.dim('(current)')}\n`);
    output.log(
      `This CLI is managed by ${manager}, so only the current version is available. ` +
        `The recommended way to manage CLI versions is the installer: ${CURL_INSTALL_COMMAND}`
    );
    return 0;
  }

  const versions = await listInstalledVersions();

  if (versions.length === 0) {
    output.log('No installed versions found');
    return 0;
  }

  for (const version of versions) {
    const active = version === (context.linkedVersion ?? context.version);
    const labels = [];
    if (active) labels.push('active');
    if (version === context.pinnedVersion) labels.push('pinned');
    output.print(
      active
        ? `${chalk.cyan(version)} ${chalk.dim(`(${labels.join(', ')})`)}\n`
        : `${version}\n`
    );
  }

  return 0;
}
