---
'@vercel/build-utils': major
---

Remove `getOsRelease()` and `getProvidedRuntime()`.

Amazon Linux 2 build containers were retired, so `getProvidedRuntime()` could only ever return `provided.al2023`, and `provided.al2` is no longer an accepted Lambda runtime. Worse, the helper derived the runtime from the machine the build ran on — so `vercel build` executed on an AL2 host stamped `provided.al2` and the resulting prebuilt deployment was rejected at deploy time.

Custom runtimes that called `getProvidedRuntime()` should use the `'provided.al2023'` literal instead.

`validateBuildResult()` no longer accepts an `osRelease` option. The runtime allowlist check was previously skipped unless the caller passed `osRelease.VERSION === '2023'`; it now always runs.
