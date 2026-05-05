# [MEDIUM] Protection bypass token printed verbatim in debug output

**File:** [`packages/cli/src/commands/curl/bypass-token.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/curl/bypass-token.ts#L45-L109) (lines 45, 109)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `secret-in-log`

## Owners

**Suggested assignee:** `jeffsee.55@gmail.com` _(via last-committer)_

## Finding

L109 prints the actual protection bypass token in a debug message: `Using existing protection bypass token from project settings: ${protectionBypass}`. L45 also prints the protection bypass response object in debug output, which depending on how `debugToString` formats it may include the token string. Although debug output requires the user to pass `--debug`, debug logs are routinely shared with Vercel support, pasted into bug reports, attached to GitHub issues, or captured in CI logs. The protection bypass secret is a long-lived credential that grants access to protected deployments — printing it to logs increases the chance of accidental exposure (e.g., a user shares a debug trace, the token ends up in a public issue/Slack channel/screenshot). 

Concretely, the token at L109 is the same value sent later as the `x-vercel-protection-bypass` header (index.ts:41), so anyone in possession of the debug log can reuse it directly against the victim's protected deployments.

## Recommendation

Redact the token in debug output. Either log only a hash/prefix (e.g., the first 4 chars + `…`) or replace the value with `[redacted]`. Apply the same treatment to L45 — log only a non-sensitive identifier (e.g., `Object.keys(protectionBypass)` count) rather than the full response object that contains the token strings.

## Recent committers (`git log`)

- Jeff See <jeffsee.55@gmail.com> (2025-11-10)
- Dimitri Mitropoulos <dimitrimitropoulos@gmail.com> (2025-10-30)
