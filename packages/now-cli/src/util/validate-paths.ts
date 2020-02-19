import { lstat as lstatRaw } from 'fs';
import { promisify } from 'util';
import { Output } from './output';
import chalk from 'chalk';
import { homedir } from 'os';
import confirm from './input/confirm';
import { prependEmoji, emoji } from './emoji';
import toHumanPath from './humanize-path';

const stat = promisify(lstatRaw);

/**
 * A helper function to validate the `rootDirectory` input.
 */
export async function validateRootDirectory(
  output: Output,
  cwd: string,
  path: string,
  errorSuffix: string
) {
  const pathStat = await stat(path).catch(() => null);
  const suffix = errorSuffix ? ` ${errorSuffix}` : '';

  if (!pathStat) {
    output.print(
      `${chalk.red('Error!')} The provided path ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )} does not exist.${suffix}\n`
    );
    return false;
  }

  if (!pathStat.isDirectory()) {
    output.print(
      `${chalk.red('Error!')} The provided path ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )} is a file, but expected a directory.${suffix}\n`
    );
    return false;
  }

  if (!path.startsWith(cwd)) {
    output.print(
      `${chalk.red('Error!')} The provided path ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )} is outside of the project.${suffix}\n`
    );
    return false;
  }

  return true;
}

export default async function validatePaths(
  output: Output,
  paths: string[]
): Promise<
  | { valid: true; path: string; isFile: boolean }
  | { valid: false; exitCode: number }
> {
  // can't deploy more than 1 path
  if (paths.length > 1) {
    output.print(`${chalk.red('Error!')} Can't deploy more than one path.\n`);
    return { valid: false, exitCode: 1 };
  }

  const path = paths[0];

  // can only deploy a directory
  const pathStat = await stat(path).catch(() => null);

  if (!pathStat) {
    output.print(
      `${chalk.red('Error!')} Could not find ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )}\n`
    );
    return { valid: false, exitCode: 1 };
  }

  const isFile = pathStat && !pathStat.isDirectory();
  if (isFile) {
    output.print(
      `${prependEmoji(
        'Deploying files with ZEIT Now is deprecated (https://zeit.ink/3Z)',
        emoji('warning')
      )}\n`
    );
  }

  // ask confirmation if the directory is home
  if (path === homedir()) {
    const shouldDeployHomeDirectory = await confirm(
      `You are deploying your home directory. Do you want to continue?`,
      false
    );

    if (!shouldDeployHomeDirectory) {
      output.print(`Aborted\n`);
      return { valid: false, exitCode: 0 };
    }
  }

  return { valid: true, path, isFile };
}
