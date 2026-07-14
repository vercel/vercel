---
'vercel': patch
---

`vercel integration add` (and `vercel install`) now suggests the closest matching integration when the given slug isn't found. If a substring search returns no results, it runs a fuzzy match and proposes "Did you mean …?" — prompting to install it in interactive mode, or surfacing the suggestion in the error in non-interactive mode — while still pointing at `vercel integration discover` to browse all integrations.
