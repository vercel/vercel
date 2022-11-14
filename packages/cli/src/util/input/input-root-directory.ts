import path from 'path';
import chalk from 'chalk';
import { validateRootDirectory } from '../validate-paths';
import Client from '../client';

export async function inputRootDirectory(
  client: Client,
  cwd: string,
  autoConfirm = false
) {
  if (autoConfirm) {
    return null;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rootDirectory } = await client.prompt({
      type: 'input',
      name: 'rootDirectory',
      message: `In which directory is your code located?`,
      transformer: (input: string) => {
        return `${chalk.dim(`./`)}${input}`;
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
        client.output,
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
