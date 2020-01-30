import path from 'path';
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

  if (!rootDirectory) {
    return null;
  }

  const normal = path.normalize(rootDirectory);

  if (normal === '.' || normal === './') {
    return null;
  }

  return normal === '.' ? null : normal;
}
