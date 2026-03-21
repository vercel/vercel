import type { ReadableTTY } from '@vercel-internals/types';

export default async function readStandardInput(
  stdin: ReadableTTY
): Promise<string> {
  return new Promise<string>(resolve => {
    if (stdin.isTTY) {
      // found tty so we know there is nothing piped to stdin
      resolve('');
    } else {
      // Guard: if no data arrives within 500ms, assume nothing was piped.
      // Once data starts flowing, cancel the timeout and read everything.
      const timer = setTimeout(() => resolve(''), 500);
      stdin.setEncoding('utf8');
      const chunks: string[] = [];
      stdin.on('data', (chunk: string) => {
        clearTimeout(timer);
        chunks.push(chunk);
      });
      stdin.on('end', () => {
        clearTimeout(timer);
        resolve(chunks.join(''));
      });
    }
  });
}
