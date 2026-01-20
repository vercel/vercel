---
'@vercel/build-utils': minor
---

Add CI environment variable overrides for node version and package manager detection. When `VERCEL_CI_CLI_TYPE` and/or `VERCEL_CI_NODE_VERSION` are set, the CLI will skip filesystem scanning for package manager and node version detection, using the provided values instead.
