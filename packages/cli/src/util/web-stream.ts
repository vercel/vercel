import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * Converts a web `ReadableStream` (from the global `fetch` API) into a
 * Node.js `Readable` stream.
 *
 * The global `ReadableStream` and `node:stream/web`'s `ReadableStream`
 * are structurally identical but TypeScript treats them as distinct types.
 * This helper bridges the gap with a single narrow cast.
 */
export function toNodeReadable(webStream: ReadableStream): Readable {
  return Readable.fromWeb(webStream as unknown as NodeWebReadableStream);
}
