---
'@vercel/frameworks': patch
---

Source the framework list from the frameworks API (`/v1/frameworks.json`) at build time. `build.mjs` fetches the manifest, writes it to `dist/frameworks.json`, and it is interpreted into runtime `Framework` objects; the API is the single source of truth (no committed copy in `src/`). The sync `frameworkList` export stays network-free at runtime. Also adds `getFrameworkList()`, an opt-in async twin that fetches and interprets the same shape for callers that want a fresher list.
