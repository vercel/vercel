---
'@vercel/node': patch
---

Quote paths with spaces in NODE_OPTIONS to fix an issue where `vercel dev` was unable to find cjs or esm loaders in case those were in paths whose folders contained spaces.
