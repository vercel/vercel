# [MEDIUM] OIDC discovery endpoints not constrained to the issuer's origin

**File:** [`packages/cli-auth/oauth.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli-auth/oauth.js#L39-L228) (lines 39, 79, 86, 88, 101, 136, 184, 204, 228)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-oidc-endpoint-validation`

## Finding

Compiled equivalent of the oauth.ts finding. authorizationServerMetadata() (lines 79-92) only checks `as.issuer !== issuer.origin` (line 88) but does not validate that token_endpoint, revocation_endpoint, jwks_uri, and introspection_endpoint share the issuer's origin. A compromised discovery response could redirect later token POSTs to attacker-controlled hosts, exfiltrating refresh_token and access_token via refreshToken (line 202), revokeToken (line 182), and introspectToken (line 226).

## Recommendation

Validate that all four endpoints share the issuer's origin before storing the discovered metadata.
