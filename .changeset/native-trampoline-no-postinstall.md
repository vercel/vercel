---
'vercel': minor
---

Add native-first trampoline with JS fallback and remove postinstall

`vercel` bin is now `bin/vercel.js`, a ~30ms ESM trampoline that tries to
resolve `@vercel/vc-native-{platform}-{arch}` via optionalDependencies
(os/cpu-aware, so only one platform binary is downloaded) and spawns the
native binary when present. Unsupported platforms, or installs where the
package manager omitted optionalDependencies, fall back to `dist/vc.js`
(VERCEL_NATIVE=0 forces JS, VERCEL_NATIVE=1 forces native).

This removes the need for `postinstall.mjs` which required `npm install
--prefix /tmp` and is blocked by default on pnpm v10, and broke on Windows
where `.bin/vercel.cmd` shims expect JS. `@vercel/vc-native` is unchanged
in this PR and will be removed in a follow-up; `vercel` works standalone
via its own bin and optionalDependencies.
