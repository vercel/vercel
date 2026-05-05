# [HIGH_BUG] acceptsMarketing toggle is silently dropped — value never persisted

**File:** [`examples/hydrogen-2/app/routes/account.profile.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.profile.tsx#L45-L169) (lines 45, 51, 52, 53, 54, 56, 57, 58, 162, 169)
**Project:** vercel
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-dead-code-data-loss`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

The form contains a checkbox `name="acceptsMarketing"` (line 164) which renders the user's marketing preference. The action handler iterates over form entries and gates them by `validInputKeys = ['firstName','lastName','email','password','phone']` (lines 45–51). Because `'acceptsMarketing'` is not in that allowlist, the `continue` on line 54 fires for that key, making the `if (key === 'acceptsMarketing') { customer.acceptsMarketing = value === 'on'; }` branch on lines 56–58 dead/unreachable code. As a result, a user toggling their marketing-communications preference will see the form submit successfully but the preference will never be sent to `customerUpdate` — the change is silently discarded. This is a real data-handling bug that affects every user submission (consent / unsubscribe handling can have legal/GDPR implications).

## Recommendation

Add `'acceptsMarketing'` to `validInputKeys`, or special-case it before the allowlist `continue`. Also coerce explicitly: `customer.acceptsMarketing = form.get('acceptsMarketing') === 'on';` outside the loop so an unchecked box (no field present) still sets `false`.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
