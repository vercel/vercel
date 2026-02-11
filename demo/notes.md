# CLI Marketplace Improvements — Demo Script

## Narrative Arc
Old CLI = interactive, human-only → New CLI = one-shot, agent-friendly

All sections use **Upstash** — multi-product integration, the hardest case.

---

## Versions

| | Version |
|---|---|
| Before my changes (Jan 2025) | **39.3.0** |
| Current (latest on main) | **50.15.1** |

Left pane = old CLI (`~/demo-old`), right pane = new CLI (`~/demo-new`).

---

## 1. Old Upstash KV — dead end

| Say | Show on screen |
|-----|----------------|
| "Let me show you what installing an integration looks like today." | Left pane: `vc integration add upstash` |
| *(wait for prompt)* | Prompt: "Select a product" → 4 options |
| "Pick a product. Arrow keys, enter." | Select Redis |
| **"And now it gives up. 'This resource must be provisioned through the Web UI.' The CLI literally can't do it."** | Error message: opens browser fallback |

---

## 2. Old Prisma — the interactive gauntlet

| Say | Show on screen |
|-----|----------------|
| "OK, let's try one the old CLI can actually do." | Left pane: `vc integration add prisma` |
| "Type a name." | Prompt: type resource name manually |
| "Pick a region." | Prompt: select region |
| "Now pick a billing plan." | Prompt: wall of text — 4 plans, each with multiple detail sections, you have to scroll through all of them |
| *(slowly scroll through the plans)* | Audience sees the massive billing plan wall scroll by |
| "Confirm selection." | Prompt: "Confirm selection?" → yes |
| **"All that work — name, region, billing plan, confirmation — and it errors out anyway."** | Error: "Authorization ID must be specified for marketplace installations (400)" |
| **"That's the old CLI. Interactive prompts that can't be scripted, can't be used in CI, and if you're building an AI agent that provisions infrastructure — forget about it."** | |

---

## 3. New Upstash KV — the one that was impossible

| Say | Show on screen |
|-----|----------------|
| "Now watch this." | Right pane: cursor blinking |
| *(type the command)* | `vc integration add upstash/upstash-kv --plan paid` |
| *(wait for output)* | Output scrolls: Installing... Provisioning... Success... Dashboard URL |
| **"Slash syntax picks the product. Region auto-detected. Name auto-generated. The old CLI couldn't even attempt this."** | Point at output lines one by one |

---

## 4. New Prisma — the gauntlet, gone

| Say | Show on screen |
|-----|----------------|
| "And Prisma — the one that took 5 prompts and then errored." | Right pane: cursor blinking |
| *(type the command)* | `vc integration add prisma` |
| *(wait for output)* | Output scrolls: Installing... Provisioning... Success... Dashboard URL |
| **"Same Prisma. One command. Zero prompts. Actually works."** | Full output visible |
| **"Start to finish, zero human input. That's what agents need."** | |
| *(optional, if audience asks)* | "You can override anything — `--name`, `--plan`, `--no-connect` — but the defaults just work." |

> **Note:** Feature flag is baked into the `vc` function when run from `~/demo-new` — no manual export needed.

Expected output (sections 3 and 4 follow this pattern):
```
> Installing <Integration> by <Partner> under <team>
> Success! <Integration> successfully provisioned: <resource-name>
>     Dashboard: https://vercel.com/<team>/~/stores/integration/<id>
> <resource-name> successfully connected to cli-test
> Downloading `development` Environment Variables for <team>/cli-test
✅  Updated .env.local file
```

---

## 5. Discovery: "How did the agent know what to type?"

| Say | Show on screen |
|-----|----------------|
| "That command had zero flags — but what if the agent needs to customize? It asks the CLI." | Terminal: cursor blinking |
| *(run the command)* | `vc integration add upstash --help` |
| *(let output render)* | Help output with products list + per-product metadata sections |
| "Look — it lists all 4 Upstash products with their slugs." | Point at product list (upstash-kv, upstash-vector, etc.) |
| "Each product shows its metadata fields, valid options, and defaults." | Point at per-product metadata sections |
| "Copy-pasteable examples right there." | Point at example commands |
| **"Generated from the actual product schema. If a partner adds a field, it shows up here automatically. The agent reads this, constructs the command, and runs it. No documentation crawling, no guessing."** | Full help output visible |

---

## 6. Eval Results (the closer)

| Say | Show on screen |
|-----|----------------|
| "But don't take my word for it." | Switch to eval dashboard in browser |
| "We built a CLI eval platform that gives the same tasks to an AI agent running the old CLI vs the new CLI, then scores whether the agent succeeded." | Show two CLI configurations side-by-side: "Baseline" vs "New CLI" |
| *(give audience a moment to read)* | Show the results table (below) |
| **"The old CLI passes 2 out of 11 tasks. The new CLI passes all 11."** | Point at scores: ~2/11 vs ~11/11 |
| **"That's the difference between a CLI built for humans clicking through prompts and one built for agents running scripts."** | |

Eval scenarios on screen:

| Eval | Task | Old CLI | New CLI |
|------|------|---------|---------|
| find-postgres-integration | Discover Postgres integrations | Pass | Pass |
| install-neon-postgres | Install Neon + create + link resource | Fail | Pass |
| create-database-resource | Provision from existing installation | Fail | Pass |
| link-resource-to-project | Link resource + verify env vars | Pass | Pass |
| postgres-full-journey | Full e2e journey | Fail | Pass |
| one-shot-provision | Provision Neon with region in one command | Fail | Pass |
| multi-product-install | Install Upstash Redis (multi-product) | Fail | Pass |
| metadata-discovery | Discover what metadata Neon/Upstash accept | Fail | Pass |
| non-interactive-provision | Zero-prompt provision + connect + env pull | Fail | Pass |
| scripted-multi-resource | Provision Neon + Upstash in one session | Fail | Pass |
| **upstash-redis-e2e** | **Supermax: Upstash Redis, zero hints** | **Fail** | **Pass** |

---

## Demo Checklist

**Live demo prep:**
- [ ] Run `demo-setup` (installs old CLI, builds new CLI, configures `vc` function, switches team)
- [ ] Upstash + Prisma already installed on test team (skip terms acceptance)
- [ ] Disconnect all Prisma/Upstash resources from `cli-test` project (avoid env var conflicts)
- [ ] Dry-run old: `demo-old && vc integration add upstash` → select Redis (dead end)
- [ ] Dry-run old: `demo-old && vc integration add prisma` (gauntlet → error)
- [ ] Dry-run new: `demo-new && vc integration add upstash/upstash-kv --plan paid` (one-shot)
- [ ] Dry-run new: `demo-new && vc integration add prisma` (one-shot)
- [ ] Dry-run new: `demo-new && vc integration add upstash --help` (dynamic help)

**Eval prep (section 6):**
- [ ] Run full suite against "Baseline" config (no FF) — screenshot/save results
- [ ] Run full suite against "New CLI" config (FF_AUTO_PROVISION_INSTALL=1) — screenshot/save results
- [ ] Have eval dashboard open and ready to show side-by-side comparison

---

## PR Inventory (for reference)

**CLI (vercel/vercel) — 11 merged:**

| PR | What | Status |
|----|------|--------|
| #14713 | Track CLI as source | Merged |
| #14734 | Initial auto-provision | Merged |
| #14841 | Fix help typos | Merged |
| #14844 | Surface hidden commands | Merged |
| #14859 | Fix prepayment API bug | Merged |
| #14863 | Auto-generate resource names | Merged |
| #14868 | Forward source/name to browser fallback | Merged |
| #14898 | Slash syntax + dynamic help | Merged |
| #14964 | Non-interactive post-provisioning (auto-connect, auto-env-pull) | Merged |
| #14871 | `--metadata` flag | Merged |
| #14965 | `--plan` flag for billing plan selection | Merged |

**API (vercel/api) — 8 merged:**

| PR | What | Status |
|----|------|--------|
| #58640 | Add 'cli' as valid source | Merged |
| #58657 | Shared IntegrationSourceSchema | Merged |
| #58905 | Apply schema defaults to auto-provision metadata | Merged |
| #58917 | Add logging, events, validation to auto-provision | Merged |
| #58920 | Refactor auto-provision into self-contained steps | Merged |
| #59163 | Use existing installation billing plan for auto-provision | Merged |
| #60302 | Accept billingPlanId in auto-provision endpoint | Merged |
| #60415 | Auto-fill required region metadata from team's function regions | Merged |

**Front (vercel/front) — 6 merged:**

| PR | What | Status |
|----|------|--------|
| #60742 | Support defaultResourceName in checkout | Merged |
| #60881 | Auto-connect resource to project for CLI flow | Merged |
| #61528 | Forward source and defaultResourceName to checkout URL | Merged |
| #61589 | Pre-fill checkout metadata from CLI | Merged |
| #61831 | Disallow whitespace in resource name validation | Merged |
| #61967 | Preselect billing plan from URL parameter | Merged |
