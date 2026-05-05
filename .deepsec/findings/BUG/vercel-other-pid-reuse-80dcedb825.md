# [BUG] Cleanup sends SIGTERM/SIGKILL by PID without liveness verification

**File:** [`packages/python/src/start-dev-server.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/start-dev-server.ts#L580-L591) (lines 580, 582, 587, 591)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-pid-reuse`

## Owners

**Suggested assignee:** `30984749+ricardo-agz@users.noreply.github.com` _(via last-committer)_

## Finding

installGlobalCleanupHandlers.killAll() iterates PERSISTENT_SERVERS and sends SIGTERM then SIGKILL to each stored pid. There is no check that the pid still belongs to the spawned Python process — if it had already exited and its PID was reused by the OS, the kernel would terminate the wrong process. PERSISTENT_SERVERS entries are also never removed when a child exits naturally (no 'exit' listener on the persisted child deletes its entry), so stale PIDs can accumulate during long vercel dev sessions that restart services. Additionally, sending SIGTERM immediately followed by SIGKILL in the same synchronous loop gives the target process no time to react to SIGTERM.

## Recommendation

Track process liveness (e.g., use child.exitCode/child.killed or check !PROCESS_EXITED flag) before sending signals. Register an 'exit' listener that removes the entry from PERSISTENT_SERVERS when the child dies. Separate SIGTERM and SIGKILL with a grace period.

## Recent committers (`git log`)

- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Michael J. Sullivan <sully@msully.net> (2026-04-15)
- dnwpark <dnwpark@protonmail.com> (2026-04-13)
- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-11)
