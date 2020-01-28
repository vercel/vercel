import chalk from 'chalk';
import inquirer from 'inquirer';
import { normalize } from 'path';

export async function inputRootDirectory(autoConfirm: boolean) {
  if (autoConfirm) {
    return null;
  }

  const { rootDirectory } = await inquirer.prompt({
    type: 'input',
    name: 'rootDirectory',
    message: `In which directory is your code located?`,
    transformer: (input: string) => {
      const message = input ? input : '[.] ';

      return message;
    },
  });

  if (!rootDirectory) {
    return null;
  }

  const path = normalize(rootDirectory);

  return path === '.' ? null : path;
}
