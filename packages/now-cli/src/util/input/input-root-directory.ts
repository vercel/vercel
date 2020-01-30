import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Output } from '../output';
import toHumanPath from '../humanize-path';

export async function inputRootDirectory(
  cwd: string,
  output: Output,
  autoConfirm: boolean
) {
  if (autoConfirm) {
    return null;
  }

  const basename = path.basename(cwd);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rootDirectory } = await inquirer.prompt({
      type: 'input',
      name: 'rootDirectory',
      message: `In which directory is your code located?`,
      transformer: (input: string) => {
        return `${chalk.dim(`${basename}/`)}${input}`;
      },
    });

    if (!rootDirectory) {
      return null;
    }

    const normal = path.normalize(rootDirectory);

    if (normal === '.') {
      return null;
    }

    const fullPath = path.join(cwd, normal);
    const fullPathStat = await fs.stat(fullPath).catch(() => null);

    if (!fullPathStat) {
      output.print(
        `${chalk.red('Error!')} The provided path ${chalk.cyan(
          `“${toHumanPath(fullPath)}”`
        )} does not exist, please choose a different one\n`
      );
      continue;
    }

    if (!fullPathStat.isDirectory()) {
      output.print(
        `${chalk.red('Error!')} The provided path ${chalk.cyan(
          `“${toHumanPath(fullPath)}”`
        )} is a file, but expected a directory\n`
      );
      continue;
    }

    if (!fullPath.startsWith(cwd)) {
      output.print(
        `${chalk.red('Error!')} The provided path ${chalk.cyan(
          `“${toHumanPath(fullPath)}”`
        )} is outside of the project, please choose a different one\n`
      );
      continue;
    }

    return normal;
  }
}
