---
"vercel": patch
---

Migrate CLI build output from CommonJS to ESM

- Change CLI package to use ESM format (`"type": "module"`)
- Add ESM shim banner for CommonJS compatibility (`require`, `__filename`, `__dirname`)
- Rename worker files to `.cjs` extension for explicit CommonJS handling
- Fix `getPackageJSON` to handle ESM `file://` URLs from stack traces
- Convert `scripts/start.js` to use dynamic import
