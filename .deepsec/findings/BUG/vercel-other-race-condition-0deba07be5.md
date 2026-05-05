# [BUG] Race condition in ensureAuthorized() can log out the user

**File:** [`packages/cli/src/util/client.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/client.ts#L200-L503) (lines 200, 231, 232, 241, 248, 254, 257, 503)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

ensureAuthorized() is called inside _fetch() and has no concurrency guard. When multiple concurrent fetches occur with an expired access token (e.g. via Promise.all in select-org.ts L48 calling getUser+getTeams, or search-project-across-teams.ts L18+L47), every call independently invokes refreshTokenRequest() with the same refresh_token from authConfig. The code already supports refresh-token rotation (L253-255 stores tokens.refresh_token when present), which means Vercel's OAuth server returns a new refresh_token and invalidates the old one. The first concurrent call succeeds and writes new tokens via updateAuthConfig() + writeToAuthConfigFile() (L248-258). The remaining concurrent calls re-use the now-invalidated old refresh_token, get back invalid_grant, hit the error branch at L239-243 which calls emptyAuthConfig() + writeToAuthConfigFile() — clobbering both the in-memory authConfig (so the 'winning' fetch then sends an unauthenticated request at L379-381) and the on-disk auth.json (so the next CLI invocation also sees no credentials). Note: reauthenticate is wrapped in sharedPromise (L503) precisely to avoid this kind of race, but ensureAuthorized was not given the same protection — the inconsistency is the smoking gun.

## Recommendation

Wrap ensureAuthorized in sharedPromise (the helper used by reauthenticate at L503) so concurrent calls share a single in-flight refresh. Alternatively, store an in-progress refresh promise on the Client instance and await it from concurrent callers. Also consider only calling emptyAuthConfig() on a confirmed invalid_grant rather than every refresh error to reduce the blast radius.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-29)
- Jeff See <jeffsee.55@gmail.com> (2026-04-16)
- Bhrigu Srivastava <bhrigu.srivastava@vercel.com> (2026-04-14)
- MelkeyDev <53410236+Melkeydev@users.noreply.github.com> (2026-04-04)
