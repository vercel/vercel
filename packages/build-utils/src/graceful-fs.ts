/**
 * Graceful filesystem operations with EMFILE/ENFILE retry handling.
 *
 * This implementation is inspired by the graceful-fs package
 * (https://github.com/isaacs/node-graceful-fs) which is licensed under
 * the Blue Oak Model License 1.0.0 (https://blueoakcouncil.org/license/1.0.0).
 *
 * Unlike graceful-fs, this module does not patch the global fs module.
 * It provides a standalone function for creating read streams with retry logic.
 */

import fs from 'fs';
import debug from './debug';

// Timeout for EMFILE retries (in milliseconds)
const GRACEFUL_FS_TIMEOUT = 30_000;

interface TimeRef {
  startTime: number;
  lastTime: number;
}

interface QueueItem {
  fn: () => void;
  error: Error;
  timeRef: TimeRef;
}

const queue: QueueItem[] = [];
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Clears the internal retry queue and timer.
 * Exported for testing purposes only.
 * @internal
 */
export function _resetGracefulFsState(): void {
  queue.length = 0;
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
}

/**
 * Track successfully opened streams so we can trigger queue processing
 * when they close (making file descriptors available).
 */
function trackStreamClose(stream: fs.ReadStream): void {
  const onClose = () => {
    stream.removeListener('close', onClose);
    stream.removeListener('error', onClose);
    // Reset queue timestamps and trigger retry when a file descriptor becomes available
    resetQueue();
  };
  stream.on('close', onClose);
  stream.on('error', onClose);
}

/**
 * Reset timestamps on queued items and trigger retry.
 * Called when a tracked stream closes, indicating file descriptors may be available.
 * Uses timeRef object so the closure in attemptOpen sees the updated startTime.
 */
function resetQueue(): void {
  const now = Date.now();
  for (const item of queue) {
    item.timeRef.startTime = now;
    item.timeRef.lastTime = now;
  }
  retry();
}

function enqueue(item: QueueItem): void {
  debug(
    `[graceful-fs] EMFILE/ENFILE error, enqueueing retry. Queue length: ${queue.length + 1}`
  );
  queue.push(item);
  retry();
}

function retry(): void {
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  if (queue.length === 0) return;

  const elem = queue.shift()!;
  const { fn, timeRef } = elem;
  const { startTime, lastTime } = timeRef;

  const now = Date.now();

  if (now - startTime >= GRACEFUL_FS_TIMEOUT) {
    // Timeout - the fn will check timeout internally and reject
    debug(
      `[graceful-fs] EMFILE/ENFILE retry timeout after ${now - startTime}ms`
    );
    elem.fn();
  } else {
    const sinceAttempt = now - lastTime;
    const sinceStart = Math.max(lastTime - startTime, 1);
    const desiredDelay = Math.min(sinceStart * 1.2, 100);

    if (sinceAttempt >= desiredDelay) {
      debug(
        `[graceful-fs] Retrying after EMFILE/ENFILE, waited ${sinceAttempt}ms`
      );
      fn();
    } else {
      // Not ready yet, put back in queue
      queue.push(elem);
    }
  }

  // Schedule next retry with unref() so timer doesn't block process exit
  if (retryTimer === undefined && queue.length > 0) {
    retryTimer = setTimeout(retry, 0);
    retryTimer.unref();
  }
}

/**
 * Callback to increment error count on the caller's object.
 */
export type OnEmfileError = () => void;

/**
 * Creates a read stream with graceful EMFILE/ENFILE handling.
 * Retries on file descriptor exhaustion with exponential backoff.
 *
 * @param fsPath - Path to the file to read
 * @param onEmfileError - Optional callback invoked each time an EMFILE/ENFILE error occurs
 * @returns Promise resolving to the readable stream
 */
export function createGracefulReadStream(
  fsPath: string,
  onEmfileError?: OnEmfileError
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    // Use a reference object so resetQueue() can update the startTime
    // and the closure will see the updated value
    let timeRef: TimeRef | undefined;

    function attemptOpen(): void {
      const now = Date.now();

      // Check for timeout before attempting
      if (
        timeRef !== undefined &&
        now - timeRef.startTime >= GRACEFUL_FS_TIMEOUT
      ) {
        debug(`[graceful-fs] EMFILE/ENFILE retry timeout for ${fsPath}`);
        reject(
          Object.assign(new Error('EMFILE retry timeout'), { code: 'EMFILE' })
        );
        return;
      }

      const stream = fs.createReadStream(fsPath);

      stream.on('open', () => {
        // Track this stream so closing it triggers queue processing
        trackStreamClose(stream);
        resolve(stream);
      });

      stream.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EMFILE' || err.code === 'ENFILE') {
          // Notify caller about the error
          onEmfileError?.();

          if (timeRef === undefined) {
            timeRef = { startTime: now, lastTime: now };
          } else {
            timeRef.lastTime = now;
          }
          enqueue({
            fn: attemptOpen,
            error: err,
            timeRef,
          });
        } else {
          reject(err);
        }
      });
    }

    attemptOpen();
  });
}
