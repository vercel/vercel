---
'@vercel/remix-builder': patch
---

Serve React Router v7 prerendered routes from static HTML/data files instead of the SSR function.

Previously, when `react-router build` ran with `prerender()` configured, the prerendered HTML and `.data` files were emitted into the build output but the per-route SSR function was still installed at the same logical paths, so the filesystem handle resolved requests to the function instead of the static files.

The builder now scans the client output for prerender artifacts (`<path>.html` and `index.html` for the root) and, when found, skips the SSR function override and emits a pre-filesystem rewrite from `/<path>` to the prerendered HTML file. Routes that aren't prerendered continue to be served by the SSR function unchanged.
