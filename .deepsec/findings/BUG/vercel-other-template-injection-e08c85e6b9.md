# [BUG] Python trampoline generated with string interpolation of user-controlled values

**File:** [`packages/python/src/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/index.ts#L657-L664) (lines 657, 658, 659, 660, 661, 664)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-template-injection`

## Owners

**Suggested assignee:** `greg.c.schofield@gmail.com` _(via last-committer)_

## Finding

The runtimeTrampoline Python source is built with template literals that directly interpolate moduleName, entrypointWithSuffix, vendorDir, and variableName inside double-quoted Python string literals and inside a single-quoted Python string at line 664. None of these are escaped. moduleName and entrypointWithSuffix derive from the user's entrypoint file path (which on Unix can legitimately contain quotes), variableName from the user's WSGI variable (validated as an identifier), and vendorDir from process.env.VERCEL_PYTHON_VENDOR_DIR. If any contain a " (for double-quoted positions) or a ' (for vendorDir at L664), the generated Python is syntactically broken or, with a crafted payload, can execute attacker-chosen code via Python string concatenation tricks. Given the Vercel threat model (user owns their deployment), injecting code into one's own Lambda is a self-attack, not a cross-tenant vulnerability. But the pattern is brittle and would become a real finding if any of these inputs ever comes from a less-trusted source (e.g., workspace package metadata from a third-party dependency).

## Recommendation

Use JSON.stringify for each interpolated string to emit a JSON-escaped double-quoted literal (valid Python). For values used inside single quotes (like _vendor_rel), likewise encode or switch to double-quoted Python strings. Better: pass these as literal bytes from Node by writing a .json config file next to the trampoline and loading it with json.load() in Python.

## Recent committers (`git log`)

- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-21)
- dnwpark <dnwpark@protonmail.com> (2026-04-20)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Nik <nik.sidnev@vercel.com> (2026-04-15)
