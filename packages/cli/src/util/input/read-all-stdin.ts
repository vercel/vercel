import type { ReadableTTY } from '@vercel-internals/types';

/**
 * Reads all data from stdin as raw bytes without trimming.
 * Resolves with an empty Buffer immediately if stdin is a TTY.
 */
export default async function readAllStdin(
  stdin: ReadableTTY
): Promise<Buffer> {
  return new Promise<Buffer>(resolve => {
    // If TTY, there can't be piped input
    if (stdin.isTTY) {
      resolve(Buffer.alloc(0));
      return;
    }
    const chunks: Buffer[] = [];
    let resolved = false;
    // Safety timeout in case the pipe never closes
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(Buffer.concat(chunks));
      }
    }, 500);
    // Preserve raw bytes
    const onData = (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    const onEnd = () => {
      if (!resolved) {
        resolved = true;
      }
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks));
      stdin.off?.('data', onData);
      stdin.off?.('end', onEnd);
    };
    stdin.on('data', onData);
    stdin.once('end', onEnd);
  });
}
