import { dirname } from 'path';
import execa from 'execa';
import listen from 'async-listen';
import { scanParentDirs, walkParentDirs } from '@vercel/build-utils';
import { createProxy } from './proxy';
import type Client from '../client';

/**
 * Attempts to execute a Vercel CLI Extension.
 *
 * If the extension was found and executed, then the
 * exit code is returned.
 *
 * If the program could not be found, then an `ENOENT`
 * error is thrown.
 */
export async function execExtension(
  client: Client,
  name: string,
  args: string[],
  cwd: string,
  apiUrl: string,
  token?: string
): Promise<number> {
  const { debug } = client.output;
  const extensionCommand = `vercel-${name}`;

  const { packageJsonPath, lockfilePath } = await scanParentDirs(cwd);
  const baseFile = lockfilePath || packageJsonPath;
  if (!baseFile) {
    // TODO: we could improve the hueristic for finding the root of
    // the project. Perhaps by looking for `.vercel` and/or `.git`.
    debug('could not locate root of project');
    throw new ENOENT(extensionCommand);
  }

  // Scan `node_modules/.bin` works for npm / pnpm / yarn v1
  // TOOD: add support for Yarn PnP
  const extensionPath = await walkParentDirs({
    base: dirname(baseFile),
    start: cwd,
    filename: `node_modules/.bin/${extensionCommand}`,
  });

  if (!extensionPath) {
    // TODO: do we want to add support for a global $PATH lookup?
    debug(`failed to find extension command with name "${extensionCommand}"`);
    throw new ENOENT(extensionCommand);
  }

  debug(`invoking extension: ${extensionPath}`);

  const proxy = createProxy(apiUrl, token);
  proxy.once('close', () => {
    debug(`extension proxy server shut down`);
  });

  const proxyUrl = await listen(proxy);
  debug(`extension proxy server listening at ${proxyUrl}`);

  const result = await execa(extensionPath, args, {
    cwd,
    reject: false,
    stdio: 'inherit',
    env: {
      ...process.env,
      VERCEL_API: proxyUrl,
      // TODO:
      //   VERCEL_SCOPE
      //   VERCEL_DEBUG
      //   VERCEL_HELP
    },
  });

  proxy.close();

  if (result instanceof Error) {
    debug(`error running extension: ${result.message}`);
  }

  return result.exitCode;
}

class ENOENT extends Error {
  code = 'ENOENT';
  constructor(command: string) {
    super(`Command "${command}" not found`);
  }
}
