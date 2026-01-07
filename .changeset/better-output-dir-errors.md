---
'@vercel/next': patch
---

Add early validation for Next.js output directory and improve error messages to guide users when the output directory is missing, empty, or misconfigured. Introduces new error codes `NEXT_OUTPUT_DIR_MISSING` and `NEXT_OUTPUT_DIR_EMPTY` with actionable guidance for common issues like Turborepo cache misconfiguration.
