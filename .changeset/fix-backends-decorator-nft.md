---
'@vercel/backends': patch
---

Fix tracing of TypeScript files that use decorators so their imports (e.g. in NestJS services) are included in the function.
