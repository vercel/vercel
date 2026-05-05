# [MEDIUM] Order detail query lacks explicit customer-ownership check

**File:** [`examples/hydrogen-2/app/routes/account.orders.$id.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.orders.$id.tsx#L17-L307) (lines 17, 18, 24, 25, 26, 303, 304, 305, 306, 307)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

The loader decodes `params.id` (line 17, `atob(params.id)`) into a Shopify GID and runs `CUSTOMER_ORDER_QUERY` (lines 24–26) which is just `order: node(id: $orderId)` (lines 303–307). The query does NOT pass `customerAccessToken` as a variable, and the Hydrogen `storefront` client created in server.ts (lines 44–53) does NOT automatically inject the customer access token into the Storefront API request — it only sets the public/private storefront tokens via `getStorefrontHeaders`. The check on lines 18–22 only verifies that *some* customer is logged in, not that the logged-in customer owns the requested order. If the Storefront API permits Order node lookups when the storefront access token is presented (i.e., treating the GID as the only authorization factor) any authenticated customer who learns or guesses another customer's order GID can view the full order — including shipping address, line items, totals, and a `statusUrl` that leaks order state. Compare to account.tsx line 47 which explicitly threads `customerAccessToken` into the Customer query.

## Recommendation

Either query orders through the customer-scoped API by passing `customerAccessToken` and using the `customer.orders` connection, or after fetching the order verify that the order's customer/email matches the session's authenticated customer before returning it. Migrating to the new Customer Account API is the long-term fix.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
