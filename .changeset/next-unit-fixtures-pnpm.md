---
---

Convert `@vercel/next` unit test fixtures from yarn to pnpm. Yarn 1 has no locking on its global cache, so concurrent fixture installs across vitest workers corrupted each other's tarball extraction (flaky EEXIST/ENOENT failures, especially on Windows). Versions previously pinned via `yarn.lock` (`next@latest` resolved to 12.3.1/13.0.1/13.1.6/13.5.3) are now pinned directly in each fixture's `package.json`.
