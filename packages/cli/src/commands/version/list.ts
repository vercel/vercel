import chalk from 'chalk';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import { packageName } from '../../util/pkg-name';
import { listAvailableVersions } from '../../util/native-self-update';

const DEFAULT_COUNT = 20;

/**
 * `vc version list`: versions available to install. For now this mirrors the
 * published `vercel` npm versions.
 */
export default async function list(): Promise<number> {
  output.spinner('Fetching available versions…', 0);

  let versions: string[];
  try {
    versions = await listAvailableVersions(packageName);
  } catch (error) {
    output.stopSpinner();
    output.error(
      `Failed to list versions: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }

  output.stopSpinner();

  if (versions.length === 0) {
    output.log('No versions found');
    return 0;
  }

  const shown = versions.slice(0, DEFAULT_COUNT);
  for (const version of shown) {
    const current = version === pkg.version;
    output.print(
      current
        ? `${chalk.cyan(version)} ${chalk.dim('(current)')}\n`
        : `${version}\n`
    );
  }

  if (versions.length > shown.length) {
    output.print(chalk.dim(`… and ${versions.length - shown.length} more\n`));
  }

  return 0;
}
