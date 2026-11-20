---
"@vercel/node": patch
---

Fix TypeScript 7 builds failing with `TS2688: Cannot find type definition file for 'node'` by writing the temporary `tsconfig.json` next to the project's `tsconfig.json` instead of the OS temp directory, so default `node_modules/@types` lookup works.
