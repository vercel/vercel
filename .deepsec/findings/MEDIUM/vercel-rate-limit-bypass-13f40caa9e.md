# [MEDIUM] No application-level rate limiting on password recovery trigger

**File:** [`examples/hydrogen-2/app/routes/account_.recover.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account_.recover.tsx#L18-L33) (lines 18, 31, 32, 33)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `rate-limit-bypass`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

The password recovery action (line 18) accepts an arbitrary email and triggers Shopify's customerRecover mutation with no application-level rate limiting or CAPTCHA. An attacker can script repeated requests to spam password-reset emails to a victim's inbox (email bombing), or to enumerate accounts via response timing/error differences. Shopify's storefront API has its own backend rate limits, which partially mitigates the risk, but those limits are not visible here and a deployed example may not have additional protection. Since this template is published as a starter, downstream users may inherit the lack of protection.

## Recommendation

Add rate limiting (per-IP and per-email) and/or CAPTCHA before invoking the customerRecover mutation. Consider integrating a lightweight middleware or upstream WAF rule to throttle requests to /account/recover.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
