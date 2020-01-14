import { lstat as lstatRaw } from 'fs';
import { promisify } from 'util';
import { Output } from './output';
import chalk from 'chalk';
import { homedir } from 'os';
import confirm from './input/confirm';

const stat = promisify(lstatRaw);

export default async function validatePaths(
  output: Output,
  paths: string[]
): Promise<number | string> {
  // can't deploy more than 1 path
  if (paths.length > 1) {
    output.print(`${chalk.red('Error!')} Can't deploy more than one path.\n`);
    return 1;
  }

  const path = paths[0];

  // can only deploy a directory
  let pathStat;
  try {
    pathStat = await stat(path);
  } catch (error) {}

  if (!pathStat || !pathStat.isDirectory()) {
    output.print(
      `${chalk.red(
        'Error!'
      )} The path you are trying to deploy is not a directory.\n`
    );
    return 1;
  }

  // ask confirmation if the directory is home
  if (path === homedir()) {
    const shouldDeployHomeDirectory = await confirm(
      `You are deploying your home directory. Do you want to continue?`,
      false
    );

    if (!shouldDeployHomeDirectory) {
      output.print(`Aborted\n`);
      return 0;
    }
  }

  return path;
}
