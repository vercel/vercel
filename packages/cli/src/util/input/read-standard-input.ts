import type { ReadableTTY } from '@vercel-internals/types';

/**
 * Reads all piped stdin before any interactive prompts run.
 *
 * When stdin is a TTY there is nothing to read, so we return '' immediately.
 * Otherwise we accumulate every 'data' chunk and resolve as soon as the
 * stream ends ('end'/'close').  A 500 ms timeout acts as a safety valve for
 * non-TTY streams that are not actually piped (e.g. some terminal
 * multiplexers) — in that case we return whatever we collected so far.
 *
 * Using stdin.once('data') was the previous approach, but it had two
 * failure modes:
 *   1. Only the first chunk was captured, so large piped values were
 *      truncated.
 *   2. If the 500 ms timeout fired before the first 'data' event the
 *      function returned '', causing downstream prompts to consume the
 *      piped bytes and leaving the value prompt with an empty read.
 */
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
    let settled = false;

    const settle = (value: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        stdin.removeListener('data', onData);
        stdin.removeListener('end', onEnd);
        stdin.removeListener('close', onEnd);
        resolve(value);
      }
    };

    const onData = (chunk: string) => {
      data += chunk;
    };

    const onEnd = () => {
      settle(data);
    };

    // Resolve with whatever we've collected if no 'end'/'close' event arrives
    // in time.  This preserves the original behaviour for non-piped non-TTY
    // streams while giving piped streams a chance to deliver all their data
    // before any interactive prompts run.
    const timer = setTimeout(() => settle(data), 500);

    stdin.on('data', onData);
    stdin.once('end', onEnd);
    stdin.once('close', onEnd);
  });
}
