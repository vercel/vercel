---
"@vercel/node": patch
---

fix(node): honour skipLibCheck tsconfig option in TypeScript Language Service per-file analysis

When EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS is enabled (used by @vercel/hono and other framework presets), the TypeScript Language Service per-file getSemanticDiagnostics() call did not respect skipLibCheck: true from tsconfig. This caused build failures from type errors in node_modules .d.ts files that tsc would normally suppress. The fix manually filters diagnostics originating from .d.ts files when skipLibCheck is enabled, matching tsc behaviour.
