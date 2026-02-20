---
'@vercel/functions': patch
---

fix(functions): scope cache tag encoding to commas only instead of full `encodeURIComponent` to avoid breaking tags containing colons, ampersands, and other non-comma special characters. Also encode commas in `invalidateByTag`, `dangerouslyDeleteByTag`, and `addCacheTag` for consistency.
