import type { ReadableTTY } from '@vercel-internals/types';

export default async function readStandardInput(
  stdin: ReadableTTY
): Promise<string> {
  return new Promise<string>(resolve => {
    if (stdin.isTTY) {
      // found tty so we know there is nothing piped to stdin
      resolve('');
      return;
    }

    stdin.setEncoding('utf8');
    let data = '';
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(data);
      }
    };

    stdin.on('data', (chunk: string) => {
      data += chunk;
    });

    stdin.once('end', finish);
    stdin.once('error', finish);

    // Fallback timeout only triggers if no data was received
    // This handles edge cases where stdin exists but has no content
    setTimeout(() => {
      if (data === '') {
        finish();
      }
    }, 500);
  });
}
