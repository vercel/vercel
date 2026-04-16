---
'vercel': patch
---

Add naming and formatting utilities for OpenAPI CLI integration.

Introduces `foldNamingStyle` for case-insensitive matching across camelCase/kebab-case/snake_case, `humanReadableColumnLabel` for converting schema property paths to readable headers, and `inferCliSubcommandAliases` for auto-generating CLI aliases from HTTP methods.
