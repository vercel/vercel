import type { Readable } from 'stream';

export default async function readStandardInput(
  stdin: Readable | NodeJS.ReadStream
): Promise<string> {
  return new Promise<string>(resolve => {
    setTimeout(() => resolve(''), 500);

    if ('isTTY' in stdin && stdin.isTTY) {
      // found tty so we know there is nothing piped to stdin
      resolve('');
    } else {
      stdin.setEncoding('utf8');
      stdin.once('data', resolve);
    }
  });
}
