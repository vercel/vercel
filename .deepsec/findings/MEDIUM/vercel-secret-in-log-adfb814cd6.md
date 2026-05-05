# [MEDIUM] Raw OAuth response stringified into error message can leak tokens

**File:** [`packages/cli-auth/oauth.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli-auth/oauth.js#L167-L294) (lines 167, 174, 236, 241, 288, 294)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secret-in-log`

## Finding

In the OAuthError constructor (lines 288-307), when neither the success schema nor the OAuthErrorResponse schema matches the raw response, the full response is JSON.stringify'd into the error message at line 294: `const message = \`Unexpected server response: ${JSON.stringify(response)}\``. In edge cases (malformed token response, unexpected response shape) this can embed access_token / refresh_token / session_id directly into the thrown error, which then propagates to logs, terminal output, or crash reports.

## Recommendation

Avoid stringifying the raw response. Whitelist only OAuth error fields (error, error_description, error_uri) or use a redaction helper that strips known-sensitive keys before serialization.
