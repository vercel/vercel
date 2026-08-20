import chalk from 'chalk';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import {
  isCurlInstall,
  listInstalledVersions,
  getLinkedVersion,
  getPinnedVersion,
  CURL_INSTALL_COMMAND,
} from '../../util/native-self-update';

/**
 * `vc version installed`: versions managed under `~/.vercel/versions` for
 * curl installs; for package manager installs just report the current one.
 */
export default async function installed(): Promise<number> {
  if (!(await isCurlInstall())) {
    output.print(`${pkg.version} ${chalk.dim('(current)')}\n`);
    output.log(
      `This CLI is managed by a package manager, so only the current version is available. ` +
        `The recommended way to manage CLI versions is the installer: ${CURL_INSTALL_COMMAND}`
    );
    return 0;
  }

  const [versions, linked, pinned] = await Promise.all([
    listInstalledVersions(),
    getLinkedVersion(),
    getPinnedVersion(),
  ]);

  if (versions.length === 0) {
    output.log('No installed versions found');
    return 0;
  }

  for (const version of versions) {
    const active = version === (linked ?? pkg.version);
    const labels = [];
    if (active) labels.push('active');
    if (version === pinned) labels.push('pinned');
    output.print(
      active
        ? `${chalk.cyan(version)} ${chalk.dim(`(${labels.join(', ')})`)}\n`
        : `${version}\n`
    );
  }

  return 0;
}
