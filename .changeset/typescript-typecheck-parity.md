---
'@vercel/backends': patch
---

Align TypeScript typecheck behavior with `@vercel/node`: discover tsconfig from the entrypoint, ignore diagnostics 6059/18002/18003, default `target` from the Node.js version, strip emit-oriented options, and prefer the user's `typescript` install.
