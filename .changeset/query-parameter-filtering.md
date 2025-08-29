---
"@vercel/build-utils": minor
"@vercel/next": minor
---

Add filterRegexMatches support for query parameter filtering in prerender routes. This feature allows filtering query parameters from named regular expression matches based on the allowQuery configuration, ensuring only allowed parameters are passed to resume lambda calls.