---
'vercel': minor
---

Make `vercel domains buy` agent-first: agents prepare the purchase, humans confirm it.

- Add flags for every prompt: `--years`, `--auto-renew`/`--no-auto-renew`, `--expected-price` (refuses when the quote moved), registrant contact flags (`--first-name`, `--last-name`, `--email`, `--phone`, `--address`, `--city`, `--state`, `--zip`, `--country`, `--company`), and `--format json`. Provided flags skip their prompts; missing ones still prompt.
- Non-interactive, `--format json`, and CI runs are now prepare-only dry runs: they check availability and price, then emit a structured `action_required` payload (`reason: purchase_requires_user`, exit 0 when buyable) with a fully-prefilled interactive command in `next[]`. The purchase POST remains unreachable outside the interactive flow.
- Structured errors with stable reason codes and recovery commands: `domain_not_available`, `tld_not_supported`, `price_changed`, `payment_failed`, `additional_contact_info_required` (previously mislabeled as a CLI TLD limitation).
- Better interactive UX: a single order-summary table with one explicit confirmation, prefilled contact prompts, a searchable country select, and post-purchase next steps (`domains verify`, `domains inspect`, alias).
