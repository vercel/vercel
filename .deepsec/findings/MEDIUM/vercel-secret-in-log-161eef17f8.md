# [MEDIUM] Raw OAuth response stringified into error message can leak tokens

**File:** [`packages/cli-auth/oauth.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli-auth/oauth.ts#L184-L337) (lines 184, 196, 262, 269, 333, 337)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secret-in-log`

## Owners

**Suggested assignee:** `info@balazsorban.com` _(via last-committer)_

## Finding

In the OAuthError constructor (lines 333-348), if the response cannot be parsed by either the expected success schema (TokenSet/IntrospectionResponse) and also fails to parse as the OAuthErrorResponse schema, the entire raw response is JSON.stringify'd into the error message: `const message = `Unexpected server response: ${JSON.stringify(response)}`` (line 337). The 'response' here is the raw json from a token, refresh, or introspection call. In edge cases — e.g., a successful token response that's missing or has a malformed required field, or an unexpected response shape — this would embed access_token, refresh_token, or session metadata directly into the error message. The error then propagates and is typically logged to the console or a debug log by the calling CLI, persisting the secret in plaintext on disk or in the terminal scrollback.

## Recommendation

Do not stringify the raw response. Either omit the response body entirely from the error message, or whitelist only safe fields (e.g., `error`, `error_description`, `error_uri`) before serialization. A safe redaction helper that strips known-sensitive keys (access_token, refresh_token, id_token, token, session_id, code) before JSON.stringify would also work.

## Recent committers (`git log`)

- Balázs Orbán <info@balazsorban.com> (2025-10-09)
