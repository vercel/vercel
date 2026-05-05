# [MEDIUM] OIDC discovery endpoints not constrained to the issuer's origin

**File:** [`packages/cli-auth/oauth.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli-auth/oauth.ts#L3-L253) (lines 3, 57, 67, 71, 110, 153, 206, 227, 253)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-oidc-endpoint-validation`

## Owners

**Suggested assignee:** `info@balazsorban.com` _(via last-committer)_

## Finding

In authorizationServerMetadata() (lines 57-79), the OIDC discovery response is parsed via the AuthorizationServerMetadata zod schema, which only validates that token_endpoint, revocation_endpoint, jwks_uri, and introspection_endpoint are valid URLs (z.url()). The only origin check (line 71) compares as.issuer to issuer.origin, but does NOT verify that the discovered endpoints share the issuer's origin. An attacker who could compromise or MITM the discovery endpoint (e.g., via a future weakened TLS scenario, supply-chain attack on the issuer host, or in a downstream consumer of @vercel/cli-auth that points 'issuer' at a less-trusted host) could redirect the CLI's later token POST requests — including the user's refresh_token (refreshToken at line 225-243) and access_token (revokeToken/introspectToken at lines 204-272) — to attacker-controlled servers, exfiltrating credentials. Per OAuth/OIDC security best practices (OAuth 2.0 Security BCP, draft-ietf-oauth-security-topics), endpoints retrieved from discovery should be validated to share the issuer's authority.

## Recommendation

Validate that token_endpoint, revocation_endpoint, jwks_uri, and introspection_endpoint URLs all share the same origin as the configured issuer. For example: `for (const ep of [as.token_endpoint, as.revocation_endpoint, as.jwks_uri, as.introspection_endpoint]) { if (new URL(ep).origin !== issuer.origin) throw new OAuthError(...) }`.

## Recent committers (`git log`)

- Balázs Orbán <info@balazsorban.com> (2025-10-09)
