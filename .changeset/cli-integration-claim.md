---
'vercel': minor
---

Add support for claiming sandbox marketplace resources (Stripe, Shopify) from the CLI. `integration list` shows a new `Claim` column, `integration-resource claim <name>` opens the provider claim URL in the browser and polls until completion, and `integration add` offers to claim sandbox resources after provisioning with new `--claim` / `--no-claim` flags.
