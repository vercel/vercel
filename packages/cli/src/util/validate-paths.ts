import { lstat } from 'fs-extra';
import chalk from 'chalk';
import { homedir } from 'os';
import { resolve, sep } from 'path';
import toHumanPath from './humanize-path';
import type Client from './client';
import output from '../output-manager';
import { canPrompt } from './can-prompt';
import { outputActionRequired } from './agent-output';
import { AGENT_REASON, AGENT_STATUS } from './agent-output-constants';

/**
 * A helper function to validate the `rootDirectory` input.
 */
export async function validateRootDirectory(
  cwd: string,
  path: string,
  errorSuffix = ''
) {
  const pathStat = await lstat(path).catch(() => null);
  const suffix = errorSuffix ? ` ${errorSuffix}` : '';

  if (!pathStat) {
    output.error(
      `The provided path ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )} does not exist.${suffix}`
    );
    return false;
  }

  if (!pathStat.isDirectory()) {
    output.error(
      `The provided path ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )} is a file, but expected a directory.${suffix}`
    );
    return false;
  }

  // Normalize first: a raw `startsWith` lets `<cwd>-evil` / `<cwd>/../x` through.
  const base = resolve(cwd);
  const target = resolve(path);
  if (target !== base && !target.startsWith(base + sep)) {
    output.error(
      `The provided path ${chalk.cyan(
        `“${toHumanPath(path)}”`
      )} is outside of the project.${suffix}`
    );
    return false;
  }

  return true;
}

export default async function validatePaths(
  client: Client,
  paths: string[],
  { allowFiles = false }: { allowFiles?: boolean } = {}
): Promise<
  | { valid: true; path: string; isFile: boolean }
  | { valid: false; exitCode: number }
> {
  // can't deploy more than 1 path
  if (paths.length > 1) {
    output.error(`Can't deploy more than one path.`);
    return { valid: false, exitCode: 1 };
  }

  const path = paths[0];

  const pathStat = await lstat(path).catch(() => null);

  if (!pathStat) {
    output.error(`Could not find ${chalk.cyan(`“${toHumanPath(path)}”`)}`);
    return { valid: false, exitCode: 1 };
  }

  const isFile = pathStat.isFile();
  if (!pathStat.isDirectory() && !(allowFiles && isFile)) {
    output.fatal(
      allowFiles
        ? 'Deploy a regular file or directory. Symbolic links and special files are not supported as deployment paths.'
        : 'This command requires a directory. Use `vercel <file>` to deploy a single file.'
    );
    return { valid: false, exitCode: 1 };
  }

  // Home-directory deployment always requires interactive confirmation,
  // even with --yes, to avoid accidentally uploading personal files.
  if (path === homedir()) {
    if (!canPrompt(client)) {
      const message =
        "Can't deploy your home directory without interactive confirmation. Run from your project directory, or run in a terminal to confirm deploying your home directory.";
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED,
          message,
          userActionRequired: true,
        },
        2
      );
      output.error(message);
      return { valid: false, exitCode: 2 };
    }

    const shouldDeployHomeDirectory = await client.input.confirm(
      `You are deploying your home directory. Do you want to continue?`,
      false
    );

    if (!shouldDeployHomeDirectory) {
      output.print(`Canceled\n`);
      return { valid: false, exitCode: 0 };
    }
  }

  return { valid: true, path, isFile };
}
