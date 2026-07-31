---
'@vercel/build-utils': major
---

Remove `getOsRelease()`, and stop deriving the provided runtime from the build host.

`getProvidedRuntime()` is retained and now always resolves to `'provided.al2023'`. It previously read `/etc/os-release` and returned `'provided.al2'` on Amazon Linux 2 hosts, so the emitted runtime depended on where the build ran — a `vercel build` on an AL2 machine produced output that is rejected at deploy time, because `provided.al2` is no longer an accepted Lambda runtime. Custom runtimes calling `getProvidedRuntime()` need no changes and are fixed by this release.

`getOsRelease()` is removed with no replacement.

`validateBuildResult()` no longer accepts an `osRelease` option. Its runtime allowlist check was previously skipped unless the caller passed `osRelease.VERSION === '2023'`; it now always runs.
