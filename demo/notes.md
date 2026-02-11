# CLI Marketplace Improvements — Demo Script

## Narrative Arc
Old CLI = interactive, human-only → New CLI = one-shot, agent-friendly

All sections use **Upstash Redis** — the hardest case (multi-product, required metadata, billing plan selection).

---

## Versions

| | Version |
|---|---|
| Before my changes (Jan 2025) | **39.3.0** |
| Current (latest on main) | **50.15.0** |

Demo the "old" experience on `39.3.0`, demo the "new" experience on `50.15.0`.

---

## 1. The Old Experience (show the pain)

| Say | Show on screen |
|-----|----------------|
| "Let me show you what installing an integration looks like today." | Terminal: `vc integration add upstash` |
| *(wait for prompts to appear)* | Prompt: "Select a product" → 4 options (Redis, Vector, QStash, Search) |
| "First, pick a product. Arrow keys, enter." | Arrow through options, select Redis |
| "Now pick a region." | Prompt: "Choose your region" → arrow keys, enter |
| "Type a name." | Prompt: type resource name manually |
| "Pick a billing plan." | Prompt: "Choose a billing plan" → scroll through wall of text, enter |
| "Connect to a project?" | Prompt: "Do you want to link this resource to the current project?" → y |
| **"That's 6 interactive steps just to install one Redis cache. Every install needs a human at a terminal. Can't script it. Can't use it in CI. And if you're building an AI agent that provisions infrastructure — forget about it."** | Final output visible showing all the steps that were taken |

---

## 2. The One-Shot (money moment)

| Say | Show on screen |
|-----|----------------|
| "Now watch this." | Terminal: cursor blinking |
| *(type the command)* | `vc integration add upstash/upstash-kv` |
| *(wait for output)* | Output scrolls: Installing... Provisioning... Success... Connected... Downloaded .env.local... Dashboard URL |
| **"Same integration, completely different experience. One command, zero flags, zero prompts."** | Full output visible on screen |
| "Slash syntax picks the product. Region auto-detected from the team's existing projects. Name auto-generated. Default billing plan. Auto-connected to the project. Env vars pulled into `.env.local`." | Point at output lines one by one |
| **"Start to finish, zero human input. That's what agents need."** | |
| *(optional, if audience asks)* | "You can override anything — `--name`, `-m primaryRegion=fra1`, `--plan`, `--no-connect` — but the defaults just work." |

> **Note:** Feature flag is baked into the `vc` function when run from `~/demo-new` — no manual export needed. Ensure test team has at least one project with a function region (so the API can infer the region).

Expected output:
```
> Installing Upstash for Redis by Upstash under <team>
Provisioning resource...
> Success! Upstash for Redis successfully provisioned: upstash-kv-teal-fox
> Connected upstash-kv-teal-fox to <project> (production, preview, development)
> Downloaded .env.local file
Dashboard: https://vercel.com/<team>/~/stores/integration/<id>
```

---

## 3. Discovery: "How did the agent know what to type?"

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

## 4. Eval Results (the closer)

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
- [ ] Run `./demo/setup.sh` (installs old CLI, builds new CLI, configures `vc` function)
- [ ] `cd ~/demo-old && vc link` — link to test team/project
- [ ] `cd ~/demo-new && vc link` — link to test team/project
- [ ] Upstash already installed on test team (skip terms acceptance)
- [ ] Dry-run: `cd ~/demo-old && vc integration add upstash` (old experience)
- [ ] Dry-run: `cd ~/demo-new && vc integration add upstash/upstash-kv` (one-shot)
- [ ] Dry-run: `cd ~/demo-new && vc integration add upstash --help` (dynamic help)

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
