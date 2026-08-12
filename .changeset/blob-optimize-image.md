---
'vercel': minor
---

Add `vercel blob put-image <file-or-url>`. The command runs an image through Vercel Image Optimization and stores only the optimized output in the Blob store, printing the resulting blob URL (or the full result with `--json`). It accepts a local file or a public http(s) URL as the source, with `--width` (required), `--quality` (default 75), and `--format` (jpeg/png/webp/avif, original preserved when omitted) controlling the transformation and `--pathname` (required) setting where the result is stored. The command warns when the optimizer kept the original image because the optimized output would have been larger. Requires OIDC credentials (`--oidc-token` + `--store-id`, or `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`). Uses the new `putImage` method from `@vercel/blob` 2.8.0; the stored content type always comes from the optimizer output, so there is no `--content-type` flag.
