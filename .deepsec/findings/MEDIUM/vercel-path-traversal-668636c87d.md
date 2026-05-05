# [MEDIUM] Missing path-bounds validation when resolving x-matched-path to file path

**File:** [`packages/node/src/bundling-handler.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/node/src/bundling-handler.js#L56-L271) (lines 56, 67, 76, 242, 253, 257, 271)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `shay.cichocki8@gmail.com` _(via last-committer)_

## Finding

The bundled Lambda handler reads `x-matched-path` from the request, strips a leading slash, and passes the result to `resolveEntrypoint`, which calls `resolve('./' + name)` and then `existsSync` for `.js`/`.cjs`/`.mjs` candidates and `index.{js,cjs,mjs}` if the result is a directory (L51-69, L241-274). The resulting absolute path is then loaded as a module via `import(pathToFileURL(filePath).href)` (L75-77), and any exported function is invoked. There is no check that the resolved path remains inside the Lambda's deployment directory. Although the route transforms at build.ts L644-668 use `op: 'set'` (preventing a directly-spoofed header from surviving) and URL paths are normally normalized by upstream proxies, the regex `/((?!index$).*?)(?:/)?` captures the URL path with `.*?` which DOES match `/`. If any layer in the chain fails to fully normalize URL-encoded traversal sequences (`%2F%2E%2E%2F`), backslashes, or other tricky encodings, an attacker could load and execute any JS module reachable from the Lambda's working directory — including arbitrary `node_modules` packages (with side-effecting top-level code) or files in parent directories like `/var/runtime/*`. This is a defense-in-depth gap: the routing layer should not be the sole barrier between an HTTP header and `import()` of an arbitrary file.

## Recommendation

After computing `base = resolve('./' + name)`, verify that `base` is contained within `process.cwd()` (or a known root such as the Lambda task root). For example: `if (!base.startsWith(taskRoot + path.sep)) return null;`. Additionally consider rejecting any entrypoint name containing `..`, backslashes, NUL bytes, or URL-encoded sequences before resolution.

## Recent committers (`git log`)

- Shay Cichocki <shay.cichocki8@gmail.com> (2026-04-15)
