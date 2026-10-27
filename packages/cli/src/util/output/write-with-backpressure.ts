import type { Writable } from 'node:stream';

/**
 * Writes `text` and resolves once the stream can accept more data, so callers
 * that produce output in batches stop fetching while a slow reader catches up.
 */
export function writeWithBackpressure(
  stream: Writable,
  text: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener('drain', onDrain);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Output stream closed.'));
    };
    if (stream.destroyed) {
      onClose();
      return;
    }
    stream.once('drain', onDrain);
    stream.once('error', onError);
    stream.once('close', onClose);
    try {
      if (stream.write(text)) onDrain();
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
