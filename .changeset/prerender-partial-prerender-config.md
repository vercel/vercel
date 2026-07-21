---
'@vercel/build-utils': minor
---

Add `partialPrerenderConfig` option to `Prerender`. Builders set it per Partial Prerendering (PPR) route; `staticHint: true` indicates the page had no dynamic components detected at build time and should be opted out of async-shell-miss handling at the CDN.
