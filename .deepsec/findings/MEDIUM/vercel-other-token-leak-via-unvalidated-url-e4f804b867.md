# [MEDIUM] Auto-generated protection bypass token sent to user-supplied deployment URL without host validation

**File:** [`packages/cli/src/commands/curl/shared.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/curl/shared.ts#L201-L231) (lines 201, 213, 220, 227, 230, 231)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-token-leak-via-unvalidated-url`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

getDeploymentUrlAndToken() (L132–245) accepts a user-supplied --deployment value, resolves it via getDeploymentUrlById() which can return ANY origin (see deployment-url.ts findings), and then unconditionally fetches/creates a protection bypass token for the LINKED project (L227–238). The fullUrl is built from the unverified baseUrl (L220) and the bypass token is later attached as the `x-vercel-protection-bypass` header (index.ts:38–43) when curl is invoked. There is no check that `baseUrl` belongs to the linked project (or to any Vercel domain) before associating the project's bypass secret with the request. 

When a user runs the command with no existing project bypass and no `VERCEL_AUTOMATION_BYPASS_SECRET` env var, this code path will SILENTLY CREATE a new project bypass secret via the API (bypass-token.ts:11–71) and immediately leak it to the attacker-controlled URL. This makes the leak persistent: the secret remains valid on the project even after the curl request completes.

The combination of (a) trusted user URL, (b) automatic token attachment, and (c) automatic token creation amplifies the impact compared to just leaking an existing token.

## Recommendation

Before fetching/creating the bypass token, verify that the target host (parsed from baseUrl) is a known Vercel domain or is part of the linked project's aliases/deployment URLs. If the user supplied a non-project URL via --deployment, do not attach the bypass header (and do not auto-create a secret). Require --protection-bypass to be explicitly supplied for non-Vercel URLs.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-13)
- Dimitri Mitropoulos <dimitrimitropoulos@gmail.com> (2025-11-20)
- Jeff See <jeffsee.55@gmail.com> (2025-11-10)
- Swarnava Sengupta <swarnavasengupta@gmail.com> (2025-11-05)
