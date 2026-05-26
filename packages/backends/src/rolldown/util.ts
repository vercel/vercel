import { writeSync } from 'node:fs';

// Using unique delimiters with newlines and double underscores to minimize collision risk
export const BEGIN_INTROSPECTION_RESULT = '\n__VERCEL_INTROSPECTION_BEGIN__\n';
export const END_INTROSPECTION_RESULT = '\n__VERCEL_INTROSPECTION_END__\n';

/**
 * Register a callback that emits the introspection result to the parent
 * process at exit time. The callback fires exactly once and uses
 * synchronous, blocking writes to fd 1 so that arbitrarily-large payloads
 * are delivered intact regardless of stdout pipe buffer size.
 *
 * Why not just `process.on('exit', ...)` with `console.log`:
 *
 * `console.log` writes via `process.stdout`, which Node sets to
 * **non-blocking** mode when stdout is a pipe (which it is when the
 * parent captures it). On `'exit'`, Node tears down the process
 * synchronously without draining stdout, so any payload larger than the
 * pipe buffer (typically 64 KiB on macOS, 16+ KiB on Linux) is silently
 * truncated and the parent never sees the `__VERCEL_INTROSPECTION_END__`
 * marker. With per-route `config` blocks in the payload, even modest
 * route counts (~50 routes with regions/failovers) hit this limit.
 *
 * The fix has three parts, all of them necessary:
 *
 *   1. Flip fd 1 to **blocking** mode before writing. Without this,
 *      `fs.writeSync` returns short on a full pipe buffer *and* the next
 *      call throws `EAGAIN` instead of waiting for the parent to drain.
 *      `setBlocking(true)` is undocumented but stable across Node
 *      versions and is the same trick Node uses internally to ensure
 *      `console.log()` of large strings flushes when piped (see
 *      `lib/internal/process/stdio.js`).
 *
 *   2. Write via `fs.writeSync(1, ...)` — a synchronous write directly to
 *      fd 1. Combined with (1), the write blocks until the parent drains
 *      the pipe rather than returning short or throwing.
 *
 *   3. Loop the write. Even in blocking mode, `fs.writeSync` is allowed
 *      to return short; the libc contract is "writes at least one byte
 *      unless interrupted", not "writes everything". The loop handles
 *      partial writes correctly.
 *
 * A "fire once" guard across all three handlers (`SIGINT` / `SIGTERM` /
 * `'exit'`) prevents the duplicate-emit that the previous implementation
 * had when SIGTERM was followed by natural exit.
 */
export const setupCloseHandlers = (
  cb: () =>
    | {
        routes: {
          src: string;
          dest: string;
          methods: string[];
          config?: unknown;
        }[];
        additionalFolders?: string[];
        additionalDeps?: string[];
      }
    | undefined
) => {
  let fired = false;

  const fireOnce = () => {
    if (fired) return;
    fired = true;
    const result = cb();
    if (!result) return;
    const payload = `${BEGIN_INTROSPECTION_RESULT}${JSON.stringify(
      result
    )}${END_INTROSPECTION_RESULT}`;

    // Force fd 1 into blocking mode so subsequent `writeSync` calls wait
    // for the parent to drain the pipe instead of returning EAGAIN.
    const stdoutHandle = (process.stdout as any)._handle as
      | { setBlocking?: (value: boolean) => void }
      | undefined;
    stdoutHandle?.setBlocking?.(true);

    // Loop the write — `writeSync` may return short even when blocking.
    // Use a plain `Uint8Array` rather than `Buffer` to satisfy older
    // `@types/node`, which declares the relevant overload as
    // `ArrayBufferView` and is strict about the generic parameter on
    // `Buffer`.
    const buf = new TextEncoder().encode(payload);
    let written = 0;
    while (written < buf.length) {
      try {
        written += writeSync(1, buf, written, buf.length - written);
      } catch {
        // fd 1 closed (EPIPE / EBADF) or some other unrecoverable error.
        // Parent will time out and fall back to its default-routes
        // result.
        break;
      }
    }
  };

  process.on('SIGINT', fireOnce);
  process.on('SIGTERM', fireOnce);
  process.on('exit', fireOnce);
};
