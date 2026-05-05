# [MEDIUM] Password change does not verify the current password

**File:** [`examples/hydrogen-2/app/routes/account.profile.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.profile.tsx#L69-L256) (lines 69, 70, 71, 72, 73, 74, 227, 228, 229, 230, 231, 252, 253, 254, 255, 256)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-missing-reauth`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

The profile form prompts for `currentPassword` (line 181) and the helper `getPassword` (lines 227–259) requires it to be present whenever `newPassword` is set, but the value is never sent to Shopify for verification. `customerUpdate` is called with only `customerAccessToken` and the new `password` (lines 69–74). Any actor who has obtained a valid `customerAccessToken` (XSS-stolen session, leaked log, shared device with cookies) can rotate the victim's password to a value of their choosing without knowing the current password — defeating the standard reauth-on-password-change defense and giving the attacker durable account takeover. A non-attacker user is also misled into thinking their entered current-password is being checked.

## Recommendation

Re-authenticate before allowing the password change: call `customerAccessTokenCreate` with the supplied currentPassword and the customer's email and only proceed if it succeeds, or require the user to re-login. At minimum stop displaying the current-password field if it is not actually verified, to avoid misleading users.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
