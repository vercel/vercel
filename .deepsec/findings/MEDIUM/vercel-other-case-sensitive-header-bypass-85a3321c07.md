# [MEDIUM] Case-sensitive NONOVERRIDABLE_HEADERS check allows middleware to override protected headers

**File:** [`packages/cli/src/util/dev/headers.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/dev/headers.ts#L23-L72) (lines 23, 33, 51, 57, 65, 72)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-case-sensitive-header-bypass`

## Owners

**Suggested assignee:** `130414394+erikareads@users.noreply.github.com` _(via last-committer)_

## Finding

The `NONOVERRIDABLE_HEADERS` set contains lowercase entries (e.g. 'host', 'connection', 'content-length'). However, the override loop at lines 71-89 reads keys from `overriddenKeys` (which preserves the case as supplied by the middleware response in `x-middleware-override-headers`) and checks `NONOVERRIDABLE_HEADERS.has(key)` case-sensitively. A malicious or buggy middleware can therefore bypass the protection by sending `x-middleware-override-headers: Host` (capitalized) along with `x-middleware-request-Host: attacker-value`. Because `NONOVERRIDABLE_HEADERS.has('Host')` returns false, the bypass code reaches `reqHeaders[key] = newValue` (line 82) and stores `reqHeaders['Host'] = 'attacker-value'`. The resulting `reqHeaders` object now has both `host` (original, lowercased by Node) and `Host` (override). When forwarded via `nodeHeadersToFetchHeaders` (which uses node-fetch's case-insensitive Headers.set) or through Node's http module, the override wins, effectively spoofing the Host header. The same bypass works for `Connection`, `Content-Length`, `Transfer-Encoding`, `TE`, `Upgrade`, `Trailer`, `Keep-Alive` — all the headers the protection is meant to lock down. The existing test suite (test/unit/util/dev/headers.test.ts) only verifies the lowercase path. Note: the set itself also contains a duplicate `'transfer-encoding'` entry (lines 27 and 29) which doesn't change behavior but signals copy-paste error.

## Recommendation

Normalize all header names to lowercase before comparison. Concretely: change line 58 to `overriddenKeys.add(key.trim().toLowerCase());`, and change the deletion loop (line 65) and override loop (line 72) to use `key.toLowerCase()` for both the `NONOVERRIDABLE_HEADERS.has()` check and the `respHeaders.get('x-middleware-request-' + key)` lookup. Also remove the duplicate `transfer-encoding` and add a regression test that uses `Host`/`HOST`/`Content-Length` as override keys.

## Recent committers (`git log`)

- Erika Rowland <130414394+erikareads@users.noreply.github.com> (2024-11-20)
- Seiya Nuta <nuta@seiya.me> (2022-10-27)
- Nathan Rajlich <n@n8.io> (2022-06-27)
