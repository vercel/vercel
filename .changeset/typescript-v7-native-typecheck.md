---
'@vercel/node': patch
---

[spike] Handle TypeScript 7 for plain `api/` Node.js functions: keep the classic Compiler API on typescript@5.9 for transpile/`ts-morph`, detect user-installed typescript@≥7 (which no longer exports `createLanguageService`), and optionally typecheck via the native `tsc` binary (`@typescript/native` / `VERCEL_NODE_NATIVE_TYPECHECK=1`).
