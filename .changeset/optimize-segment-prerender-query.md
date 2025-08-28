---
"@vercel/next": patch
---

Optimize segment prerender with blank allowQuery for client parsing

When client segment cache, parsing, and PPR are enabled, use empty allowQuery for segment prerenders since segments don't vary based on route parameters. This ensures both RSC and segment prerenders are in the same group and revalidated together, improving cache efficiency.