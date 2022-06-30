import type { ReadableTTY } from '../../types';

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
