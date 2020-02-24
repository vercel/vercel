import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Output } from '../output';
import { validateRootDirectory } from '../validate-paths';

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

    if (normal === '.' || normal === './') {
      return null;
    }

    const fullPath = path.join(cwd, normal);

    if (
      (await validateRootDirectory(
        output,
        cwd,
        fullPath,
        'Please choose a different one.'
      )) === false
    ) {
      continue;
    }

    return normal;
  }
}
