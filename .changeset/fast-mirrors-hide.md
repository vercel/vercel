---
"vercel": minor
---

Dependency optimization: Reduced package size and complexity while maintaining feature parity
- Replaced `chalk` with `picocolors` (80% smaller, same functionality)
- Replaced `node-fetch` with native fetch API (available in Node.js 18+)
- Inlined small utility packages (`ms`, `bytes`, `strip-ansi`, `title`)
- Consolidated multiple versions of dependencies
- Updated `semver` from 5.7.2 to 7.5.4
- Removed deprecated packages (`codecov`, `glob`, `@types/jest-expect-message`)
- Added modern alternatives (`c8`, `fast-glob`)
