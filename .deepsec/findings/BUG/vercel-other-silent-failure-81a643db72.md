# [BUG] Project deletion silently swallows non-404/403 errors and reports success

**File:** [`packages/cli/src/commands/project/rm.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/project/rm.ts#L54-L73) (lines 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-silent-failure`

## Owners

**Suggested assignee:** `130414394+erikareads@users.noreply.github.com` _(via last-committer)_

## Finding

In the DELETE call's catch block, only 404 and 403 API errors are explicitly handled with a return. For any other error (500, 401, 502, network/timeout failures, or any non-APIError thrown), control falls through the catch with no `return` and no rethrow. Execution then continues to lines 68-73, which print a `Success! Project <name> removed` message and return 0. This means a user (or a CI script consuming exit code 0) can be misled into believing a project was deleted when the API call actually failed. The existing add.ts handles this correctly by rethrowing unhandled errors (line 70 `throw err;`), but rm.ts does not. This is also a correctness/observability issue that could mask incidents (e.g., a 5xx outage during DELETE looks like success).

## Recommendation

Add an `else` branch (or trailing `throw err;` / `printError(err); return 1;`) to the catch block so that any unrecognized error results in a non-zero exit and a user-facing error message. Mirror the pattern in add.ts which rethrows unknown errors after handling specific status codes.

## Recent committers (`git log`)

- Erika Rowland <130414394+erikareads@users.noreply.github.com> (2025-01-13)
- Nathan Rajlich <n@n8.io> (2024-11-05)
