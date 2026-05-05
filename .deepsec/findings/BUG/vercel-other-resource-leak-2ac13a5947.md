# [BUG] Potential semaphore leak in toStreamAsync

**File:** [`packages/build-utils/src/file-fs-ref.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/build-utils/src/file-fs-ref.ts#L86-L93) (lines 86, 87, 88, 89, 90, 91, 92, 93)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-resource-leak`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

The semaphore `semaToPreventEMFILE` is acquired before creating a read stream, but the release callbacks are only attached to the stream's 'close' and 'error' events. If `fs.createReadStream(this.fsPath)` throws synchronously (e.g., on invalid path types), or if the consumer of the returned stream never reads it to completion or destroys it, the semaphore counter is never decremented. After 20 such leaks, all subsequent calls will hang indefinitely waiting on `acquire()`. This is build-tooling and unlikely to cause production issues, but it's a latent resource-management bug.

## Recommendation

Wrap the `fs.createReadStream` call in a try/catch that releases the semaphore on synchronous failure. Additionally, consider using a finally-style cleanup or a `'end'` listener alongside `'close'`/`'error'` to ensure release on all stream termination paths.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- JJ Kasper <jj@jjsweb.site> (2024-01-18)
- Andrew Healey <healeycodes@gmail.com> (2023-07-03)
- Peter van der Zee <209817+pvdz@users.noreply.github.com> (2022-10-05)
- Sean Massa <EndangeredMassa@gmail.com> (2022-03-08)
