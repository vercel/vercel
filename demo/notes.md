# CLI Marketplace Improvements — Demo Script

## Intro

Hi, I'm Tony from the Marketplace team. As part of the company-wide initiative to make agents love the Vercel CLI, we've been improving the marketplace-related parts of the CLI. We started by focusing on the most painful area — resource installation — and I want to share some early results.

_Pre-demo cleanup: [Delete all Prisma resources](https://vercel.com/acme-marketplace-team-vtest314/~/integrations/prisma/icfg_CSeZTv0jmrvMfqq6wDyoq3nS) before starting._

---

## The before — installing a Prisma database

First, I want to show you the state before our changes. Let's try to install a Prisma database.

_Narrate through each step as it appears. Pick the Pro plan._

> **RUN (left pane):** `vc integration add prisma`

_Steps: Name → Region → Billing plan (scroll slowly, pick Pro) → Confirm → Link to project_

As you can see, this is a very tedious process — five interactive prompts just to provision one database. You can't script it, you can't use it in CI, and it's not friendly to AI agents at all.

---

## Flags — every choice is now a flag

The first improvement we made was making all of these choices expressible as flags.

_Show the help output with all available flags._

> **RUN (right pane):** `vc integration add prisma --help`

So now an AI agent can do the same thing in a single command — name, plan, region, all as flags. I'll also pass `--no-connect` because I don't want to connect to the project yet.

> **RUN (right pane):** `vc integration add prisma --name xyztest --plan pro -m region=iad1 --no-connect`

---

## Smart defaults

Now, that was still a lot of decisions the AI agent has to make. To reduce the number of decision points, we implemented smart defaults — we'll pick the region for you, generate a database name for you, pick a plan for you.

> **RUN (right pane):** `vc integration add prisma`

Boom — one command, zero flags, everything is already done. Project connected, env vars pulled.

---

## Discover — structured output for agents

To help AI agents easily find and decide what integration to use, we also shipped a discover command.

> **RUN (right pane):** `vc integration discover --format=json`

_Point to the JSON output — structured data with slugs, names, categories._

Now they can, for example, find Upstash.

> **RUN (right pane):** `vc integration discover --format=json | grep upstash`

---

## Eval Results

Now, don't take my word for it. Using the CLI eval framework we demoed last week, we ran evals against the old and new CLIs and can see a marked improvement in success rates.

_Switch to eval dashboard browser tab (TBD)._

---

## Thank you

Thank you for your attention.
