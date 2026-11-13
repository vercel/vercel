import { spawn } from 'node:child_process';
import process from 'node:process';

/** The platform's "open this URL" command. */
export function openCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): [string, string[]] {
  if (platform === 'darwin') {
    return ['open', [url]];
  }
  // `start` is a cmd builtin; the empty string is its window title argument.
  if (platform === 'win32') {
    return ['cmd', ['/c', 'start', '', url]];
  }
  return ['xdg-open', [url]];
}

/** Open a URL in the default browser. Resolves to whether the opener started. */
export function openInBrowser(url: string): Promise<boolean> {
  const [command, args] = openCommand(url);
  return new Promise(resolve => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}
