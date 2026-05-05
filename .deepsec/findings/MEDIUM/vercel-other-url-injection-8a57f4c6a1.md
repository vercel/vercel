# [MEDIUM] URL injection via unencoded projectId/teamId in api.vercel.com call

**File:** [`packages/oidc/src/token-util.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/oidc/src/token-util.ts#L101) (lines 101)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-url-injection`

## Owners

**Suggested assignee:** `39992+gr2m@users.noreply.github.com` _(via last-committer)_

## Finding

`getVercelOidcToken` at L101 builds the API URL via template-literal interpolation without URL-encoding `projectId` or `teamId`: `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${teamId}` : ''}`. If `projectId` contains characters like `?`, `#`, `/`, or whitespace, the URL structure can be subverted (path becomes a different endpoint, or query string starts earlier). If `teamId` contains `&` or `=`, attacker-injected query parameters become part of the request. While the host (api.vercel.com) is fixed and the user's bearer auth token is therefore not leaked cross-origin, an attacker who controls these inputs (via a malicious `.vercel/project.json` they convince a user to use, or via a third-party caller passing user-supplied IDs unvalidated) could cause the user's auth token to be sent to unintended Vercel API endpoints, potentially performing actions or reading data the user didn't intend.

## Recommendation

URL-encode the path segment and query value: e.g., `https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''}`. Better: use `new URL()` and `URLSearchParams` to build the URL safely.

## Recent committers (`git log`)

- Gregor Martynus <39992+gr2m@users.noreply.github.com> (2026-02-10)
- Alice <105500542+alice-wondered@users.noreply.github.com> (2026-01-05)
- Casey Gowrie <casey.gowrie@vercel.com> (2025-11-19)
