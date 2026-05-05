# [MEDIUM] OAuth discovery token_endpoint not validated against issuer origin

**File:** [`packages/oidc/src/oauth.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/oidc/src/oauth.ts#L20-L57) (lines 20, 26, 31, 40, 44, 45, 57)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-oauth-discovery-trust`

## Owners

**Suggested assignee:** `105500542+alice-wondered@users.noreply.github.com` _(via last-committer)_

## Finding

`getTokenEndpoint()` at L25-47 fetches `https://vercel.com/.well-known/openid-configuration`, extracts `metadata.token_endpoint`, and uses it directly as the URL for token refresh requests (which carry the user's refresh_token). The only validation is `typeof metadata.token_endpoint === 'string'` — there is no check that the URL: (a) uses HTTPS scheme (a malicious response could downgrade to HTTP, leaking the refresh_token in plaintext), (b) is on the same origin as the issuer (https://vercel.com) or a trusted Vercel-controlled domain, (c) is even a valid URL. Additionally, the resolved endpoint is cached in module-level `_tokenEndpoint` for the entire process lifetime, so a single poisoned discovery response persists. While exploitation requires compromising vercel.com's discovery endpoint or breaking TLS, OAuth clients should defensively validate that the discovered endpoints are on the issuer's origin (RFC 8414 §3.3 recommends issuer authentication of metadata).

## Recommendation

After parsing the discovery response, validate: (1) `new URL(metadata.token_endpoint).protocol === 'https:'`, (2) the URL's origin is one of an explicit allow-list (e.g., `https://vercel.com` or `https://api.vercel.com`), (3) optional sanity check that issuer claim in response equals VERCEL_ISSUER. Throw on any mismatch.

## Recent committers (`git log`)

- Alice <105500542+alice-wondered@users.noreply.github.com> (2026-01-05)
