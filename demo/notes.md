# CLI Marketplace Improvements — Demo Script

## Narrative Arc
Old CLI = interactive, human-only → New CLI = one-shot, agent-friendly

Demo uses **Prisma Postgres** — single-product, clean before/after comparison.

---

## Versions

| | Version |
|---|---|
| Before my changes (Jan 2025) | **50.4.9** |
| Current (latest on main) | **50.15.1** |

Left pane = old CLI (`~/demo-old`), right pane = new CLI (`~/demo-new`).

**Pre-demo cleanup:** [Delete all Prisma resources](https://vercel.com/acme-marketplace-team-vtest314/~/integrations/prisma/icfg_CSeZTv0jmrvMfqq6wDyoq3nS) before starting.

---

## 1. Old Prisma — the interactive gauntlet

> **RUN (left pane):** `vc integration add prisma`

| Say | Show on screen |
|-----|----------------|
| "Let me show you what installing an integration looks like today." | Left pane: run the command above |
| "Type a name." | Prompt: type resource name manually |
| "Pick a region." | Prompt: select region |
| "Now pick a billing plan." | Prompt: wall of text — 4 plans, each with multiple detail sections, you have to scroll through all of them |
| *(slowly scroll through the plans)* | Audience sees the massive billing plan wall scroll by |
| "Confirm selection." | Prompt: "Confirm selection?" → yes |
| "Link to project?" | Prompt: "Do you want to link this resource to the current project?" |
| **"That's 5 interactive steps to provision one database. Every install needs a human at a terminal. Can't script it. Can't use it in CI. And if you're building an AI agent that provisions infrastructure — forget about it."** | |

---

## 2. Discovery + New Prisma — the full equivalent

> **RUN (right pane):** `vc integration add prisma --help`

| Say | Show on screen |
|-----|----------------|
| "The new CLI. How would an agent know what flags to use? It asks." | Right pane: run the command above |
| *(let output render)* | Help output showing `--name`, `--plan`, `--no-connect`, metadata fields |
| "Every parameter the old CLI prompted for — name, region, billing plan — is now a flag." | Point at flags |
| **"Generated from the actual product schema. The agent reads this, constructs the command, and runs it."** | |

> **RUN (right pane):** `vc integration add prisma --name xyztest --plan pro -m region=iad1`

| Say | Show on screen |
|-----|----------------|
| "So let's use those flags." | Right pane: run the command above |
| *(wait for output)* | Output scrolls: Installing... Provisioning... Success... Connected... env pull |
| **"Same result. One command. Name, plan, region — all flags. Scriptable. CI-friendly. Agent-friendly."** | Full output visible |

> **Cleanup (right pane):** `vc integration-resource remove xyztest -a -y`

---

## 3. New Prisma — smart defaults

> **RUN (right pane):** `vc integration add prisma`

| Say | Show on screen |
|-----|----------------|
| "But we made it even easier. Drop every flag." | Right pane: run the command above |
| *(wait for output)* | Output scrolls: Installing... Provisioning... Success... Connected... env pull |
| **"Zero flags. Name auto-generated. Free plan auto-selected. Region inferred. Auto-connected. Env vars pulled. That's what agents need."** | Full output visible |

> **Note:** Feature flag is baked into the `vc` function when run from `~/demo-new` — no manual export needed.

Expected output (section 2):
```
> Installing <Integration> by <Partner> under <team>
> Success! <Integration> successfully provisioned: <resource-name>
>     Dashboard: https://vercel.com/<team>/~/stores/integration/<id>
> <resource-name> successfully connected to cli-test
> Downloading `development` Environment Variables for <team>/cli-test
✅  Updated .env.local file
```

---

## 4. Discover — structured output for agents

> **RUN (right pane):** `vc integration discover --format=json`

| Say | Show on screen |
|-----|----------------|
| "One more thing. How does an agent even find integrations in the first place?" | Right pane: run the command above |
| *(let output render)* | JSON array of integrations with slugs, names, categories |
| **"Structured JSON. An agent can search, filter, and pick the right integration programmatically. No scraping, no guessing."** | Full JSON output visible |

---

## 5. Eval Results (the closer)

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
