import type { ReadableTTY } from '@vercel-internals/types';

/**
 * Reads all data from stdin as raw bytes without trimming.
 * Resolves with an empty Buffer immediately if stdin is a TTY.
 */
export default async function readAllStdin(
  stdin: ReadableTTY
): Promise<Buffer> {
  return new Promise<Buffer>(resolve => {
    if (stdin.isTTY) {
      resolve(Buffer.alloc(0));
      return;
    }
    const chunks: Buffer[] = [];
    // do not setEncoding so we preserve raw bytes
    stdin.on('data', (chunk: Buffer | string) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    });
    stdin.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
