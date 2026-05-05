# [HIGH_BUG] Inconsistent order ID encoding between OrderItem links

**File:** [`examples/hydrogen-2/app/routes/account.orders._index.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.orders._index.tsx#L112-L119) (lines 112, 119)
**Project:** vercel
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-inconsistent-id-encoding`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

Within OrderItem, two links are rendered to the same logical destination (the order detail page) but use different URL formats. Line 112 links to `/account/orders/${order.id}` (raw GID like `gid://shopify/Order/12345`), while line 119 links to `/account/orders/${btoa(order.id)}` (base64-encoded). The downstream route handler can only accept one of these formats, so one of these links will break (404 or fail to render the order). This is a clear functional bug — both links should use the same encoding.

## Recommendation

Standardize on one encoding (likely `btoa(order.id)` to match the pattern other Shopify Hydrogen examples use for ID URL safety). Apply the same transformation to both Link `to` props.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
