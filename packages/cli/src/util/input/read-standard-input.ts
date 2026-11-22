import type { ReadableTTY } from '@vercel-internals/types';
import rawBody from 'raw-body';

/** Read a complete UTF-8 payload, dropping one trailing newline. */
export async function readStdinText(
  stdin: ReadableTTY,
  limit: number
): Promise<string> {
  if (stdin.isTTY) return '';
  return (await rawBody(stdin, { limit, encoding: 'utf8' })).replace(
    /\r?\n$/,
    ''
  );
}

export default async function readStandardInput(
  stdin: ReadableTTY
): Promise<string> {
  return new Promise<string>(resolve => {
    setTimeout(() => resolve(''), 500);

    if (stdin.isTTY) {
      // found tty so we know there is nothing piped to stdin
      resolve('');
    } else {
      stdin.setEncoding('utf8');
      stdin.once('data', resolve);
    }
  });
}
