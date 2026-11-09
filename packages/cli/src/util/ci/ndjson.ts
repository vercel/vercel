import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import split from 'split2';
import type Client from '../client';
import { toNodeReadable } from '../fetch';

/**
 * Requests a newline-delimited JSON stream and yields each parsed line.
 * Non-2xx responses throw before the first value is yielded.
 */
export async function* readNdjson<T>(
  client: Client,
  url: string,
  options: { accountId?: string; signal?: AbortSignal } = {}
): AsyncGenerator<T> {
  const response = await client.fetch(url, {
    json: false,
    accountId: options.accountId,
    signal: options.signal,
  });
  const source = toNodeReadable(response.body);
  const maxFrameBytes = 8 * 1024 * 1024;
  let frameBytes = 0;
  const bounded = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start);
        const end = newline === -1 ? chunk.length : newline;
        frameBytes += end - start;
        if (frameBytes > maxFrameBytes) {
          callback(new Error('Vercel CI response frame exceeds 8 MiB.'));
          return;
        }
        if (newline === -1) break;
        frameBytes = 0;
        start = newline + 1;
      }
      callback(null, chunk);
    },
  });
  const lines = split();
  // Bound frames before splitting, including partial and multibyte records.
  // Observe failures immediately, even while the generator is paused at a yield.
  const completion = pipeline(source, bounded, lines, {
    signal: options.signal,
  }).then(
    () => undefined,
    (error: unknown) => error
  );
  try {
    // Some log backends return an ordinary JSON snapshot even with follow=1.
    // Keep its envelope intact so callers can validate and handle snapshot EOF.
    const snapshot =
      response.headers.get('content-type')?.split(';')[0] ===
      'application/json';
    let json = '';
    let bytes = 0;
    for await (const line of lines as AsyncIterable<string>) {
      if (snapshot) {
        bytes += Buffer.byteLength(line) + 1;
        if (bytes > 8 * 1024 * 1024) {
          throw new Error('Vercel CI JSON snapshot exceeds 8 MiB.');
        }
        json += `${line}\n`;
      } else if (line.trim()) {
        yield JSON.parse(line) as T;
      }
    }
    const error = await completion;
    if (error) throw error;
    if (snapshot) yield JSON.parse(json) as T;
  } finally {
    // Returning early or failing to parse must also cancel the response body.
    // Await teardown before callers abort their fetch controller, preserving any
    // error from iteration rather than replacing it with a cleanup AbortError.
    source.destroy();
    bounded.destroy();
    lines.destroy();
    await completion;
  }
}
