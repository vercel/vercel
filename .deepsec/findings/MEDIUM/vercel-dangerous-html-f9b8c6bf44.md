# [MEDIUM] dangerouslySetInnerHTML renders styledTitle from search API without client-side sanitization

**File:** [`examples/hydrogen-2/app/components/Search.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/components/Search.tsx#L402-L407) (lines 402, 403, 404, 405, 406, 407)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `dangerous-html`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

At line 404, `item.styledTitle` is injected via `dangerouslySetInnerHTML`. Tracing the data flow: in app/routes/api.predictive-search.tsx line 160, `styledTitle` is populated from `query.styledText` returned by Shopify's `predictiveSearch` API. The `styledText` value contains HTML markup that wraps the user-supplied search term (e.g., '<b>shoe</b>'). The user's raw search term (line 67 of api.predictive-search.tsx, read from `body.get('q')` or `searchParams.get('q')`) is reflected back inside this HTML. The example code performs no client-side sanitization (no DOMPurify, no escaping, no allowlist) and trusts Shopify's server-side escaping completely. If Shopify's sanitization ever has a defect, every site built from this example becomes XSS-exploitable. More importantly, this is example code under examples/ that developers will copy into their own apps — including ones with custom or less-rigorous search backends — where the pattern becomes directly exploitable.

## Recommendation

Sanitize the HTML before rendering, e.g., wrap with DOMPurify: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.styledTitle, { ALLOWED_TAGS: ['b', 'mark', 'strong'] }) }}`. Alternatively, parse the search term and matching ranges and render with React elements rather than raw HTML. At minimum, document the trust assumption inline so developers copying the example understand the upstream-sanitization dependency.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
