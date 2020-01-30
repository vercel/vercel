import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

export async function inputRootDirectory(autoConfirm: boolean) {
  if (autoConfirm) {
    return null;
  }

  const { rootDirectory } = await inquirer.prompt({
    type: 'input',
    name: 'rootDirectory',
    message: `In which directory is your code located?`,
    transformer: (input: string) => {
      return input ? input : '[.] ';
    },
  });

  if (!rootDirectory || rootDirectory === '.' || rootDirectory === './') {
    return null;
  }

  const normal = path.normalize(rootDirectory);

  return normal === '.' ? null : normal;
}
