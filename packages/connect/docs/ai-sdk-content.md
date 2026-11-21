# Native AI SDK integration for `@vercel/connect` — content plan

**Status:** proposal
**Scope:** docs and recipes that ship alongside the SDK work. Lives in two repos: `vercel/vercel-front` (`vercel-docs`) and `vercel/ai` (`content/` + `examples/`).
**Companion doc:** [`ai-sdk-implementation.md`](./ai-sdk-implementation.md) plans the SDK changes in `packages/connect` and the example app that smoke-tests them.

## Why this is a separate plan

The SDK work and the content work have different audiences, different review timelines, and different blast radius:

- **SDK** ships as a versioned npm package. Reviewers are TypeScript/SDK maintainers. Mistakes are recoverable via a patch release.
- **Content** ships to vercel.com and ai-sdk.dev. Reviewers are docs/DevRel. Mistakes are visible to every developer searching for the integration and live on Google forever.

Keeping them separate lets each plan move at its own speed: the V0 content path can land *before* any SDK work starts; the V1 SDK can ship to npm before the AI SDK cookbook recipe is reviewed; the recipe can iterate independently after V1 is live.

## Audiences and where they live

| Audience                                          | Lands first on   | Entry point in this plan                                              |
| ------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| Already-Connect developers wanting the AI SDK path | vercel.com/docs  | `/docs/connect/guides/use-with-ai-sdk` + Linear example                |
| AI SDK developers who don't know Connect          | ai-sdk.dev       | Cookbook recipe `74-mcp-tools-with-vercel-connect.mdx` + MCP ref link  |
| Both audiences                                    | (cross-linked)   | Mutual links between the Connect guide and the cookbook recipe         |

The asymmetry matters: developers who already know Connect won't search ai-sdk.dev for it, and developers who know the AI SDK won't search vercel.com for a "Connect adapter" they've never heard of. We need entry points on both surfaces, each shaped for its native audience.

## V0: Docs-only (ship now)

Before any SDK code lands, the integration works today with the public surface:

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { getToken } from '@vercel/connect';
import { streamText, stepCountIs } from 'ai';

const userId = 'user_demo_123';

const token = await getToken('oauth/linear', {
  subject: { type: 'user', id: userId },
  scopes: ['read'],
});

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp.linear.app',
    headers: { Authorization: `Bearer ${token}` },
  },
});

const stream = await streamText({
  model: 'anthropic/claude-sonnet-4.6',
  prompt: 'Show me my open Linear issues',
  tools: await mcpClient.tools(),
  stopWhen: stepCountIs(10),
  onFinish: async () => { await mcpClient.close(); },
});
```

**Deliverables:**

- `vercel-docs` → `/docs/connect/guides/use-with-ai-sdk` (guide page using the V0 pattern)
- `vercel-docs` → `/docs/connect/examples/ai-agent-with-linear` (runnable Linear example using the V0 pattern)
- `vercel/ai` → nothing. V0 lives in Connect docs only; AI SDK consumers can already do this without our blessing.

Zero changes to `@vercel/connect`. This unblocks the AI SDK audience immediately while V1 SDK work is in flight.

V0 limitations (which is why V1 exists in the implementation plan):

- Token is resolved once at client init; if it expires mid-conversation, the MCP client must be rebuilt.
- Consent gating runs upfront; a tool call cannot trigger consent mid-stream.
- The consumer writes the `try { … } catch (UserAuthorizationRequiredError)` boilerplate per integration.

## V1: surface the SDK to both audiences

Once the V1 SDK ships (per [`ai-sdk-implementation.md`](./ai-sdk-implementation.md)), three content artifacts land in the same week — one on the Connect side and two on the AI SDK side.

### Artifact 1: update `vercel-docs` guide

Edit `/docs/connect/guides/use-with-ai-sdk` to feature the V1 `authProvider` variant as the recommended path. Keep the V0 bearer-header pattern as a "minimal / no extra deps" fallback at the bottom.

Imports point at `@vercel/connect/ai-sdk`. The page does *not* mention `@vercel/connect/mcp` — that subpath is for non-AI-SDK MCP clients and gets its own discovery surface (the typed SDK reference page).

### Artifact 2: cookbook recipe in `vercel/ai`

The headline reverse-discovery artifact. Lives at `content/cookbook/01-next/74-mcp-tools-with-vercel-connect.mdx`.

**Why `74`:** slots between the existing MCP recipe (`73-mcp-tools.mdx`) and the HITL recipe (`75-human-in-the-loop.mdx`), so a reader following the natural sidebar order discovers Connect immediately after learning the base MCP pattern. Keeps numbering stable — no renaming of existing files.

**Why it lives in `vercel/ai`, not just `vercel-docs`:** SEO and discoverability. A developer searching "ai sdk mcp oauth" hits ai-sdk.dev first. The Connect-side guide reaches developers who already know Connect; the cookbook recipe reaches developers who don't.

Frontmatter (matches the format the AI SDK docs builder expects):

```mdx
---
title: MCP Tools with Vercel Connect
description: Use Vercel Connect to manage OAuth for MCP-backed tools in a Next.js agent
tags: ['next', 'tool use', 'agent', 'mcp', 'oauth', 'vercel']
---
```

Recipe outline:

1. **Why** — a paragraph framing the problem (per-provider OAuth client + token storage + refresh + plumbing collapses to one adapter call).
2. **Prerequisites** — Vercel project linked, `vercel env pull` for the OIDC token, a Linear (or Linear-equivalent) Custom OAuth connector created in the Vercel dashboard.
3. **Install** — `pnpm install ai @ai-sdk/react @ai-sdk/mcp @vercel/connect`.
4. **Wire the route handler** — `app/api/chat/route.ts` showing `connectAuthProvider` slotted into `createMCPClient({ transport: { authProvider } })` + `streamText` with `convertToModelMessages` and `toUIMessageStreamResponse`.
5. **Wire the client** — `app/page.tsx` using `useChat` from `@ai-sdk/react` with `DefaultChatTransport`. (Matches the existing recipes' shape so the reader doesn't need to learn a new client pattern.)
6. **Handle consent** — `try { ... } catch (ConsentRequiredError) { redirect(err.redirectUrl) }`. Cross-link to the Connect concepts page on authentication for the deeper picture.
7. **Add approval (HITL)** — drop in `withConsentApproval(tools, { approve: ['linear_create_issue'] })` and pass `tools.approvalConfig` to `streamText`. Note the symmetry with recipe `75` — "everything from the HITL recipe applies; Connect just provides the underlying tools." (Section added with V2; placeholder in V1.)
8. **What this replaced** — short bullet list of the per-provider boilerplate the recipe sidesteps (OAuth client registration, token DB, refresh job, etc.).
9. **Next steps** — links into the AI SDK MCP reference, the Connect concepts pages, and the example app.

The recipe's code samples are extracted from `examples/next-mcp-vercel-connect/` (the smoke-test example owned by the implementation plan). Drift between the recipe and runnable code is structurally impossible because the recipe references the same files.

### Artifact 3: reference cross-link in `vercel/ai`

Small additions to `content/docs/03-ai-sdk-core/17-mcp-apps.mdx` (the canonical MCP reference). A short "Authentication" subsection (or extension of the existing one) that calls out three options for providing bearer tokens to an MCP server:

- Static bearer in `headers` — for service-to-service tokens.
- Custom `OAuthClientProvider` — for apps with existing OAuth infrastructure.
- **`@vercel/connect/ai-sdk`'s `connectAuthProvider`** — for apps using Vercel Connect to broker per-user OAuth grants. Single-paragraph mention + link to the cookbook recipe. Do *not* duplicate the recipe. (The same function is also exported from `@vercel/connect/mcp` for non-AI-SDK MCP clients; the AI SDK page only mentions `/ai-sdk`.)

This is the cross-link that turns the recipe from "hidden cookbook" into "discoverable from the canonical MCP reference."

### Discoverability touch-ups

- Add a `vercel-connect` (or `oauth`) tag to the cookbook recipe so it surfaces in tag filters.
- Update `examples/README.md` (or the equivalent index) to list `examples/next-mcp-vercel-connect/`.
- Consider a one-line callout in `content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx` under "tools that need authentication" — but only if a natural insertion point exists; do not force.

## V2: HITL content updates

Once V2 SDK lands, content artifacts follow:

- `vercel-docs` → new page `/docs/connect/guides/handle-tool-approval` walking through the chat-turn-boundary pattern and the function-timeout map (cribbed from the implementation plan's "Function timeouts and where the HITL wait fits" section, rewritten for a docs audience).
- `vercel-docs` → update the Linear example to include an approval-gated tool call.
- `vercel/ai` → append the "Approval" section to cookbook recipe `74` (filling the V1 placeholder) showing `withConsentApproval`. Don't fork the recipe.
- `vercel/ai` → the smoke-test example app gets the approval flow added; the cookbook recipe's V2 section is again extracted from it.

## Cross-repo PR coordination

The artifacts span three repos. To avoid broken cross-links during rollout:

| Repo                                    | Content artifact                                                                                                                                                                | Depends on                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `vercel/vercel-front` (`vercel-docs`)   | V0: `/docs/connect/guides/use-with-ai-sdk` + `/docs/connect/examples/ai-agent-with-linear`. V1: update guide to feature `authProvider`. V2: `/docs/connect/guides/handle-tool-approval`. | V0 has no deps; V1+ depends on the matching SDK release          |
| `vercel/ai` (`content/`)                | V1: cookbook recipe `74-mcp-tools-with-vercel-connect.mdx` + MCP reference cross-link. V2: append "Approval" section to recipe `74`.                                            | V1 published to npm                                              |
| `vercel/ai` (`examples/`)               | V1: surface `examples/next-mcp-vercel-connect/` (owned by the implementation plan as smoke-test gate) in `examples/README.md` and via the cookbook recipe's "Next steps" link.  | The example app PR (implementation plan) is open                 |

### Sequencing

1. **Land V0** in `vercel-docs` first — pure docs, no dependencies, ships the headline integration story today.
2. **Wait for V1 SDK** to publish to npm (per implementation plan).
3. **Update V0 guide** in `vercel-docs` to feature the `authProvider` variant as primary; keep the V0 bearer-header pattern as a "minimal / no extra deps" fallback.
4. **Open AI SDK PR** simultaneously with the SDK release announcement: cookbook recipe + MCP docs cross-link, both pointing at `@vercel/connect/ai-sdk`. (The example app PR is opened earlier as part of the implementation plan's release gate; the cookbook recipe's "Next steps" link slots into the merged example.)
5. **V2 content** ships in a second round across `vercel-docs` and `vercel/ai` after the V2 SDK lands.

### Cross-link rule

Every new page links to its mirror on the other side, with **asymmetric anchor text** to avoid accidental loops:

- Connect guide → "see the AI SDK cookbook recipe for the framework-specific walkthrough"
- Cookbook recipe → "see the Connect concepts pages for what happens behind the adapter"

## What `vercel/ai` content does NOT add

To keep the AI SDK docs focused, we explicitly do not propose:

- A provider page under `content/providers/` — Connect is not an LLM provider.
- A foundations page rewrite — MCP foundations already exist; we extend, not duplicate.
- A separate "auth" docs section — `OAuthClientProvider` is documented at the MCP level; Connect is one consumer of that interface.

## What `vercel-docs` content does NOT add

- A standalone "AI SDK integration" subtree under `/docs/connect/`. The guide page + Linear example are enough. Subdividing further would create empty section indexes.
- Duplication of the cookbook recipe. The Connect-side guide and the AI SDK cookbook recipe are written for different audiences; the recipe is canonical and the guide cross-links to it for the framework-specific walkthrough.

## Strategic angle (content)

The SDK ships into the void if AI SDK developers can't find it. The cookbook recipe + MCP reference cross-link in `vercel/ai` are what put the integration on the canonical surface where developers are already searching "ai sdk mcp oauth." Without them, V1 reaches only the audience that already reads `vercel.com/docs/connect` — a much smaller set than the AI SDK audience the integration is built for.

The Connect-side guide and Linear example are what convert the existing Connect audience: developers who already use Connect for service-to-service tokens and now want it to power their AI SDK agent. They land on `vercel.com/docs/connect` first, see the guide, and learn that the same Connect primitives they already use carry over to AI SDK agents one-line.

V0 (docs-only) lets us start converting both audiences today, before the SDK work is done. That's the headline reason V0 has a row in this plan at all.
