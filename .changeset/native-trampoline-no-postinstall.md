---
'vercel': minor
---

Add native-first trampoline with JS fallback and remove postinstall

vercel bin is now `bin/vercel.js`, a ~30ms ESM trampoline that tries to
resolve `@vercel/vc-native-{platform}-{arch}` via optionalDependencies
(os/cpu-aware, so only one platform binary is downloaded) and spawns the
native binary when present. Unsupported platforms, or installs where the
package manager omitted optionalDependencies, fall back to `dist/vc.js`
(VERCEL_NATIVE=0 forces JS, VERCEL_NATIVE=1 forces native).

This removes the need for `postinstall.mjs` which required `npm install
--prefix /tmp` and is blocked by default on pnpm v10, and broke on Windows
where `.bin/vercel.cmd` shims expect JS.

Exact pinned versions for the optional native packages are synced by a
new build step `utils/sync-native-optional-deps.js` wired into `ci:version`
and `ci:version:canary`, so `pnpm install --no-frozen-lockfile` in CI keeps
`pnpm-lock.yaml` and the tarball in sync. Natives are not bundled inside
the vercel tarball; npm/pnpm install only the matching os/cpu optionalDep,
and the trampoline does `require.resolve(platformPkg)` to find it.

Preview tarball flow also works: `utils/pack.ts` now rewrites optional native
deps to `https://<deployment>/tarballs/%40vercel%2Fvc-native-*.tgz` so `npx
https://.../tarballs/vercel.tgz` fetches a matching preview native when
`dist-native` is present, and `api/_lib/script/build.ts` publishes those
native tarballs alongside the main tarball. When no native is staged (most
preview builds) the optional fetch fails non-fatally and the trampoline falls
back to JS.

`@vercel/vc-native` wrapper is unchanged in this PR and will be removed in
a follow-up; `vercel` works standalone via its own bin and optionalDependencies.
