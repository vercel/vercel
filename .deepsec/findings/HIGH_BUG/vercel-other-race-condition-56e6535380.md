# [HIGH_BUG] Race condition in global http.Server.prototype.listen monkey-patch corrupts state across concurrent entrypoint compilations

**File:** [`packages/node/src/bundling-handler.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/node/src/bundling-handler.js#L166-L237) (lines 166, 167, 168, 169, 170, 171, 172, 195, 196, 197, 198, 236, 237)
**Project:** vercel
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `shay.cichocki8@gmail.com` _(via last-committer)_

## Finding

`compileUserCode` mutates the global `http.Server.prototype.listen` to capture user-created servers (L166-172). Because the bundled handler is shared across multiple entrypoints in one Lambda, two cold-start requests for different entrypoints can call `compileUserCode` concurrently. Interleaving: (1) Call A saves `originalListen = native` and patches with `patchA`; (2) Call B saves `originalListen = patchA` (NOT the native function!) and patches with `patchB`; (3) when A's user module calls `app.listen()`, it runs `patchB`, which captures the server into B's local variable and restores `listen = patchA`; (4) A's `finally` restores native; (5) B's `finally` then sets `listen = patchA` (a stale reference), leaving the prototype in a corrupted state for any later user code. Symptoms: the wrong server is captured (B gets A's server, A gets nothing), spurious 'Can't detect handler export shape' errors after the 1s timeout (L195-198), and a long-lived patched `listen` that affects subsequent module imports. This bug also exists in `serverless-functions/serverless-handler.mts` (L87-94) but is less impactful there because each Lambda hosts a single entrypoint; the bundled-handler model amplifies it.

## Recommendation

Serialize compileUserCode() across the process with a single in-flight mutex, OR remove the prototype-level patch entirely and instead detect server-style handlers by inspecting the loaded module shape (e.g., looking for an exported app/server with a `.listen` method) and then explicitly call `.listen(0, '127.0.0.1', cb)` on it. If the patch must remain, capture the *true* original by reading `http.Server.prototype.listen` only when no patch is active (e.g., guard with a module-level `isPatched` flag, and queue concurrent calls).

## Recent committers (`git log`)

- Shay Cichocki <shay.cichocki8@gmail.com> (2026-04-15)
