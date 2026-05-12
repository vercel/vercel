import { normalizePath } from '@vercel/build-utils';
import path from 'path';
import chalk from 'chalk';
import { LocalFileSystemDetector, getWorkspaces } from '@vercel/fs-detectors';
import { validateRootDirectory } from '../validate-paths';
import type Client from '../client';

export async function inputRootDirectory(
  client: Client,
  cwd: string,
  autoConfirm = false
) {
  if (autoConfirm) {
    return null;
  }

  // Skip the prompt for single-app projects. Only ask when this is a workspace
  // (monorepo with multiple packages) where the user actually needs to pick.
  const fs = new LocalFileSystemDetector(cwd);
  const workspaces = await getWorkspaces({ fs });
  if (workspaces.length === 0) {
    return null;
  }

  while (true) {
    const rootDirectory = await client.input.text({
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
        cwd,
        fullPath,
        'Please choose a different one.'
      )) === false
    ) {
      continue;
    }

    return normalizePath(normal);
  }
}
