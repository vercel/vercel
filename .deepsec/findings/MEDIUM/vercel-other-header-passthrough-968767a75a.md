# [MEDIUM] All inbound headers (except host) are forwarded verbatim to the Vercel API

**File:** [`packages/cli/src/util/extension/proxy.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/extension/proxy.ts#L21-L22) (lines 21, 22)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-header-passthrough`

## Owners

**Suggested assignee:** `472867+ofhouse@users.noreply.github.com` _(via last-committer)_

## Finding

Lines 21–22 build the upstream header set by deleting only `host` and forwarding everything else. client.fetch overrides `authorization`, `user-agent`, and `x-ai-agent`, but every other header — including `x-vercel-*`, `x-forwarded-*`, `cookie`, and any other privileged header the upstream API may honor — passes through unchanged. Combined with the unauthenticated-proxy issue above, an attacker reaching the proxy can attempt to inject headers that the Vercel API treats as privileged (protection-bypass tokens, internal routing headers, or impersonation hints).

## Recommendation

Switch from a deny-list (`headers.delete('host')`) to an allow-list. Only forward headers that extensions legitimately need (`content-type`, `accept`, `accept-encoding`, `content-length`, body-related headers). Strip all `x-vercel-*`, `x-forwarded-*`, `cookie`, and `authorization` headers from the inbound request before merging.

## Recent committers (`git log`)

- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-01-21)
- Nathan Rajlich <n@n8.io> (2025-12-17)
- Sean Massa <EndangeredMassa@gmail.com> (2024-10-28)
- Kiko Beats <josefrancisco.verdu@gmail.com> (2023-11-06)
