---
'@vercel/frameworks': patch
---

Source the framework list from the frameworks API (`/v1/frameworks.json`) at build time. `build.mjs` fetches the manifest, writes it to `dist/frameworks.json`, and it is interpreted into runtime `Framework` objects; the API is the single source of truth (no committed copy in `src/`, no runtime network access). Behavior is identical to the previous hand-written array.
