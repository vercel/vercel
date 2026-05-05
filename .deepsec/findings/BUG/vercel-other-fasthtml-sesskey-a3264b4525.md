# [BUG] fasthtml .sesskey file wraps SESSKEY in literal double quotes

**File:** [`packages/python/src/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/index.ts#L783-L786) (lines 783, 784, 785, 786)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-fasthtml-sesskey`

## Owners

**Suggested assignee:** `greg.c.schofield@gmail.com` _(via last-committer)_

## Finding

Line 785 writes files['.sesskey'] = new FileBlob({ data: `"${SESSKEY}"` }), storing the value with surrounding double quotes. If SESSKEY is alphanumeric (the normal case) and fasthtml reads .sesskey as a raw string, the stored key will include the literal quote characters — changing the effective key and potentially breaking session decryption on upgrades. If SESSKEY contains a double-quote character, the file content becomes malformed. This looks like either a bug (stray quotes) or an assumption that fasthtml eval()s the file — which would be its own concern. This is a correctness/compatibility bug, not a cross-tenant security issue, since SESSKEY is the user's own env var.

## Recommendation

Verify fasthtml's expected .sesskey format. If it expects a raw key, write SESSKEY without the wrapping quotes: data: SESSKEY. If it expects a Python/JSON string literal, use JSON.stringify(SESSKEY) so special characters are properly escaped.

## Recent committers (`git log`)

- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-21)
- dnwpark <dnwpark@protonmail.com> (2026-04-20)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Nik <nik.sidnev@vercel.com> (2026-04-15)
