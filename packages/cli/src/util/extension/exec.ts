import execa from 'execa';
import listen from 'async-listen';
import { createProxy } from './proxy';

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
  name: string,
  args: string[],
  cwd: string,
  apiUrl: string,
  token?: string
): Promise<number> {
  const extensionCommand = `vercel-${name}`;

  //let isPnP = false;
  //let binPath: string | undefined;

  const proxy = createProxy(apiUrl, token);
  const proxyUrl = await listen(proxy);

  // TODO: support npm, yarn (all versions), no package manager?
  const result = await execa(
    'pnpm',
    ['--silent', 'exec', '--', extensionCommand, ...args],
    {
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
    }
  );

  proxy.close();
  //console.log(result);

  if (result.failed) {
    // TODO: Since we don't get the exec ENOENT (pnpm exists),
    // we feed to find a way to differentiate between the
    // command missing (ENOENT) vs. the extension exiting with
    // a failure exit code.
    // For "ENOENT" - fall back to "deploy" default command
    // For valid extension name, but exitCode !== 0 - end the CLI
  }

  return result.exitCode;
}
