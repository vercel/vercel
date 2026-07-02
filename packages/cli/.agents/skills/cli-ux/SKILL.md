---
name: cli-ux
description: Use for packages/cli changes that affect command UX, prompts, help, output layout, progress, success, warnings, errors, JSON/stdout/stderr contracts, non-interactive/agent behavior, copy, or tests for those surfaces. Do not load for implementation-only refactors with unchanged CLI surface.
---

# Vercel CLI UX

Canonical front door for making the Vercel CLI consistent, sharp, scriptable, and agent-ready.

## Stance

Act like a CLI product engineer, not a string polisher.

- For material changes, define the user job, current friction, desired outcome, success signal, and non-goals before choosing output.
- Inspect the current command source and tests before judging.
- Treat shipped output as evidence, not automatic precedent. Check it against this skill, product behavior, and compatibility contracts.
- Fix the flow when the flow is wrong; copy-only edits are not enough.
- Treat copy changes as symptoms. Inspect the surrounding flow, layout, resolved-state preview, side effects, and tests before stopping.
- Keep human output readable and machine output stable.
- Treat agents as first-class users and untrusted input sources.
- Preserve compatibility unless the migration is explicit and tested.
- Prefer existing command-family helpers and patterns.

## Decision Authority

Resolve conflicts in this order:

1. The user's explicit goal and constraints.
2. Verified product and system truth: API behavior, permissions, billing, data models, reachable states, and compatibility contracts.
3. Repository-canonical guidance: `AGENTS.md`, this skill, shared helper contracts, and tests that encode intentional behavior.
4. Accepted command-specific contracts in `command-contracts.md`.
5. Verified adjacent command-family patterns.
6. General CLI heuristics.

Do not let a lower source override a higher one. Shipped code proves what exists, not why it is correct.

## Workflow

1. **Outcome map.** For material UX changes, name the user and job, current behavior, desired outcome, success signal, and non-goals.
2. **Surface map.** List help, flags, prompts, progress, warnings, success, errors, tables/lists, detail views, JSON, and agent/non-interactive payloads.
3. **Structure map.** For each touched line, identify its surface role, order, vertical rhythm, layout helper, gutter glyph or blank gutter, resolved-state preview, mutation preview, result block, and next action.
4. **Mode map.** Trace TTY, non-TTY, `--non-interactive`, JSON/format flags, CI, and pipeable stdout.
5. **State map.** Name team, project, cwd/root, environment, config files, framework/services, auth, remote resources, and defaults.
6. **Question audit.** For every prompt, prove the value cannot be inferred and that a flag/arg/payload exists.
7. **Mutation audit.** Identify local writes, remote mutations, polling, retries, idempotency, `--yes`, `--force`, typed confirmation, and `--dry-run`.
8. **Agent audit.** Verify JSON/action payloads, bounded output, safe suggested commands, and no untrusted text in instructions.
9. **Transcript review.** Read the before/after transcript for order, rhythm, duplicated concepts, alignment, and next action.
10. **Regression lock.** Test the new path and lock out old prompts, stale terms, and broken machine contracts.

## When to Load References

Load only what the task needs.

| Task surface                     | Load                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Any CLI UX/output change         | [`references/core.md`](references/core.md)                                                      |
| User-facing copy or copy review  | [`references/core.md`](references/core.md) + [`references/copy.md`](references/copy.md)         |
| Prompt/setup flow                | `copy.md` → Prompts; `core.md` → Flow Design, Prompts, Setup + Mutation Flows                   |
| Output layout/progress           | `core.md` → Output Surfaces, Layout, Glyphs + Color, Progress + Completion, Terminal Resilience |
| List/detail/resource views       | `core.md` → List + Detail Commands, Layout, Streams + Formats, Machine Introspection            |
| Streaming/follow/live commands   | `core.md` → Streaming + Long-Running Commands, Streams + Formats, Terminal Resilience           |
| Errors/permissions/rate limits   | `copy.md` → Errors + Warnings; `core.md` → Errors, Warnings, Remote Work, Secrets               |
| JSON/agent/non-interactive paths | `core.md` → Streams + Formats, Agent + Non-Interactive Output, Machine Introspection, Hardening |
| Help/flags/completions           | `copy.md` → Help; `core.md` → Commands + Flags, Help + Discoverability, Compatibility           |
| Destructive/production mutation  | `copy.md` → Clear + Consistent, Prompts; `core.md` → Dangerous Actions, Remote Work, Secrets    |
| `vc link` or setup/link work     | [`references/command-contracts.md`](references/command-contracts.md) → Link Flow Contract       |
| `vc env add` work                | `command-contracts.md` → Env Add Flow Contract                                                  |
| `vc`, `vc deploy`, deploy output | `command-contracts.md` → Deploy Flow Contract                                                   |
| Tests, stale-copy sweeps, review | [`references/verification.md`](references/verification.md)                                      |

If you add durable guidance, put detailed wording rules in `copy.md`, keep only the cross-cutting copy baseline plus reusable flow/output rules in `core.md`, put command-only state machines in `command-contracts.md`, and put test/review gates in `verification.md`. Short safety rules may repeat when sections need to stand alone; the canonical reject/fix checklist stays in `verification.md`.

## Quality Bar

Every changed command should answer:

- What target did the CLI resolve?
- What will change?
- What happened?
- What can the user or agent do next?

Top-tier commands:

- make the common path short
- ask only what cannot be inferred
- show detected state before asking for overrides
- show resolved targets in structured output before confirmations
- avoid restating values already visible in argv, prompts, or nearby rows
- show user-facing local and remote side effects in result blocks after mutation
- use gutter glyphs only for semantic state, not decoration
- use one concept per prompt
- support flags or payloads for every prompt path
- behave predictably in TTY, CI, and agent contexts
- expose stable machine-readable contracts for scripted use
- avoid duplicate remote mutations on retry
- make no-op and already-done states explicit
- end with a completed result or exact next command

## Review Gates

Apply the canonical Review Checklist in [`references/verification.md`](references/verification.md). Keep the checklist there so safety rules do not drift.

Durable skill guidance needs verified current-source evidence, scope and exceptions, rationale tied to user or compatibility consequences, and a concrete bad/good example when the rule is mechanical. One shipped string, screenshot, or review comment is not enough to establish a universal rule.

## Minimum Done State

A CLI UX change is not done until:

- the before/after transcript is easier to scan
- copy changes review every user-facing string in the supplied command surface and directly coupled states, not only the edited line
- prompt/result copy changes also checked layout, vertical rhythm, order, and surrounding flow
- resolved target and planned mutation are visible before risky work
- inferred resource confirmations show the resolved target before asking
- mutation results show durable remote resources and user-actionable local artifacts changed
- aligned rows use `printAlignedLabel()` with the shared 16-character label column and correct gutter: `▲` for production rows, `✓` for the primary completed phase, `!` for warnings, blank for previews, progress, and secondary receipt rows
- every prompt has a flag, argument, or machine-readable action path
- old vague prompts/output are locked out by tests
- JSON/agent output remains valid, bounded, and stdout-clean
- focused tests pass, or unrelated failures are named with evidence
- changes to this skill are checked against at least 2 command families with different surfaces
