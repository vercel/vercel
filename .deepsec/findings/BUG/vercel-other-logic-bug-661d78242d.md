# [BUG] Rolling-release polling branch ignores --timeout and hammers API without sleep

**File:** [`packages/cli/src/commands/promote/status.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/promote/status.ts#L89-L181) (lines 89, 90, 103, 165, 181)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

When projectCheck.rollingRelease is truthy and rr.activeStage is falsy, the loop executes `continue` (line 103). This bypasses both the timeout check at lines 165-172 (`Date.now() >= promoteTimeout`) and the `await sleep(250)` at line 181. Consequences: (1) the user's --timeout flag is silently ignored — if a rolling release is stuck without an active stage the loop runs forever, (2) the loop polls the API at network-bound speed instead of the intended 250ms cadence, making rapid back-to-back calls to getProjectByNameOrId and requestRollingRelease, and (3) `output.log('Rolling Releases enabled …')` (line 90) is emitted on every iteration, spamming the terminal. The non-rolling-release path correctly reaches the timeout/sleep at the bottom of the loop, so this branch is the only one with the defect.

## Recommendation

Before `continue` at line 103, perform the timeout check (e.g., `if (Date.now() >= promoteTimeout) { ... return 1; }`) and `await sleep(250)`. Also move the `output.log('Rolling Releases enabled …')` outside the loop or guard it so it is emitted only once.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
- Brooke Mosby <brookemosby@icloud.com> (2025-05-29)
- Erika Rowland <130414394+erikareads@users.noreply.github.com> (2024-11-15)
- Sean Massa <EndangeredMassa@gmail.com> (2024-10-28)
- Trek Glowacki <trek.glowacki@gmail.com> (2023-08-10)
