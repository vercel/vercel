# [BUG] generateCurlCommand does not shell-escape header keys or the URL

**File:** [`packages/cli/src/commands/api/request-builder.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/api/request-builder.ts#L194-L209) (lines 194, 209)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-shell-escape-inconsistency`

## Owners

**Suggested assignee:** `jeffsee.55@gmail.com` _(via last-committer)_

## Finding

In generateCurlCommand, the value portion of header arguments is run through escapeShellArg (L194), but the header key is interpolated raw into a single-quoted shell argument: parts.push(`-H '${key}: ${escapeShellArg(value)}'`). The full URL at L209 (parts.push(`'${fullUrl}'`)) is also unescaped. A header key supplied via --header that contains a single quote (e.g. `key';foo;':v`) — or an endpoint path containing a single quote — will break out of the surrounding single-quoted argument in the printed curl command. The command is only printed for the user to copy/paste, not executed by the CLI, so the security impact is low (the user supplies their own input). However, this is inconsistent with the value-escaping logic and could mislead a user who pastes the generated command, especially if the invocation was suggested by another party.

## Recommendation

Run escapeShellArg over `key` (and any other interpolated string) for parity with the value handling. Also escape the URL: `parts.push(\`'${escapeShellArg(fullUrl)}'\`);`. Alternatively, validate the header key against a strict pattern (RFC 7230 token chars: `^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$`) and reject keys containing characters that would break shell quoting.

## Recent committers (`git log`)

- Jeff See <jeffsee.55@gmail.com> (2026-04-16)
- Thomas Knickman <tom.knickman@vercel.com> (2026-01-30)
