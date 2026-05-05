# [MEDIUM] Inconsistent XML encoding of handles allows potential XML/HTML injection in sitemap

**File:** [`examples/hydrogen-2/app/routes/[sitemap.xml].tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/[sitemap.xml].tsx#L87-L131) (lines 87, 99, 130, 131)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-xml-injection`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

The sitemap renders three categories of URLs but only encodes one of them. At line 59, `product.handle` is wrapped in `xmlEncode(...)` before being interpolated into the URL. At line 87 and line 99, `collection.handle` and `page.handle` are interpolated directly into the URL string with no XML encoding. The resulting URL is then injected into `<loc>${url}</loc>` at line 130 without further escaping. If Shopify ever returns a handle containing characters like `<`, `>`, `&`, `'`, or `"`, the resulting sitemap output is malformed XML and could be used to inject arbitrary XML/HTML elements into the `<urlset>`. While Shopify currently constrains handles to URL-safe characters, the asymmetric treatment is both a defense-in-depth defect and a clear code bug — the developer demonstrably knew encoding was required (they applied it to product handles, image URLs, titles, and captions). Additionally, `lastMod` (line 131) is interpolated directly without encoding; while it currently comes from `updatedAt` ISO date strings, it relies on Shopify's data shape never changing.

## Recommendation

Apply `xmlEncode()` consistently to all interpolated values: wrap `collection.handle` (line 87), `page.handle` (line 99), and `lastMod` / `changeFreq` (lines 131-132) just as `product.handle` is wrapped at line 59. Centralize the XML rendering in a helper that always encodes inputs to enforce the invariant.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
