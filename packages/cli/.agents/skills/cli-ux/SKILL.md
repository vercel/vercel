---
name: cli-ux
description: Use when a packages/cli change affects user-visible or machine-visible CLI behavior: command flows, prompts, help text, output layout, progress, success states, warnings, errors, JSON/stdout/stderr contracts, non-interactive/agent payloads, copywriting, design-system consistency, or tests that assert those contracts. Do not load for implementation-only refactors with unchanged CLI surface. This skill folder is the canonical CLI design system; AGENTS.md is only the lean always-loaded router. IMPORTANT: load the references named in "When to Load References"; SKILL.md alone is the workflow entrypoint, not the full rule set.
---

# Vercel CLI UX

Canonical front door for making the Vercel CLI consistent, sharp, scriptable, and agent-ready.

## Stance

Act like a CLI product engineer, not a string polisher.

- Inspect the current command source and tests before judging.
- Fix the flow when the flow is wrong; copy-only edits are not enough.
- Treat copy changes as symptoms. Inspect the surrounding flow, layout, resolved-state preview, side effects, and tests before stopping.
- Keep human output readable and machine output stable.
- Treat agents as first-class users and untrusted input sources.
- Preserve compatibility unless the migration is explicit and tested.
- Prefer existing command-family helpers and patterns.

## Workflow

1. **Surface map.** List help, flags, prompts, progress, warnings, success, errors, tables/lists, detail views, JSON, and agent/non-interactive payloads.
2. **Structure map.** For each touched line, identify its surface role, order, layout helper, resolved-state preview, mutation preview, result block, and next action.
3. **Mode map.** Trace TTY, non-TTY, `--non-interactive`, JSON/format flags, CI, and pipeable stdout.
4. **State map.** Name team, project, cwd/root, environment, config files, framework/services, auth, remote resources, and defaults.
5. **Question audit.** For every prompt, prove the value cannot be inferred and that a flag/arg/payload exists.
6. **Mutation audit.** Identify local writes, remote mutations, polling, retries, idempotency, `--yes`, `--force`, typed confirmation, and `--dry-run`.
7. **Agent audit.** Verify JSON/action payloads, bounded output, safe suggested commands, and no untrusted text in instructions.
8. **Transcript review.** Read the before/after transcript for order, rhythm, duplicated concepts, alignment, and next action.
9. **Regression lock.** Test the new path and lock out old prompts, stale terms, and broken machine contracts.

## When to Load References

Load only what the task needs.

| Task surface                     | Load                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Any CLI UX/copy/output change    | [`references/core.md`](references/core.md)                                                      |
| Prompt/setup flow                | `SKILL.md` → Quality Bar; `core.md` → Flow Design, Prompts, Setup + Mutation Flows              |
| Output layout/progress           | `core.md` → Output Surfaces, Layout, Glyphs + Color, Progress + Completion, Terminal Resilience |
| List/detail/resource views       | `core.md` → List + Detail Commands, Layout, Streams + Formats, Machine Introspection            |
| Streaming/follow/live commands   | `core.md` → Streaming + Long-Running Commands, Streams + Formats, Terminal Resilience           |
| Errors/permissions/rate limits   | `core.md` → Voice + Copy, Errors, Warnings, Remote Work, Secrets                                |
| JSON/agent/non-interactive paths | `core.md` → Streams + Formats, Agent + Non-Interactive Output, Machine Introspection, Hardening |
| Help/flags/completions           | `core.md` → Commands + Flags, Help + Discoverability, Compatibility                             |
| Destructive/production mutation  | `core.md` → Dangerous Actions, Remote Work, Secrets                                             |
| `vc link` or setup/link work     | [`references/command-contracts.md`](references/command-contracts.md) → Link Flow Contract       |
| `vc`, `vc deploy`, deploy output | `command-contracts.md` → Deploy Flow Contract                                                   |
| Tests, stale-copy sweeps, review | [`references/verification.md`](references/verification.md)                                      |

If you add durable guidance, put reusable rules in `core.md`, command-only state machines in `command-contracts.md`, and test/review gates in `verification.md`. Short safety rules may repeat when sections need to stand alone; the canonical reject/fix checklist stays in `verification.md`.

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
- show local and remote side effects in result blocks after mutation
- use one concept per prompt
- support flags or payloads for every prompt path
- behave predictably in TTY, CI, and agent contexts
- expose stable machine-readable contracts for scripted use
- avoid duplicate remote mutations on retry
- make no-op and already-done states explicit
- end with a completed result or exact next command

## Review Gates

Apply the canonical Review Checklist in [`references/verification.md`](references/verification.md). Keep the checklist there so safety rules do not drift.

## Minimum Done State

A CLI UX change is not done until:

- the before/after transcript is easier to scan
- prompt/result copy changes also checked layout, order, and surrounding flow
- resolved target and planned mutation are visible before risky work
- inferred resource confirmations show the resolved target before asking
- mutation results show durable remote resources and local artifacts changed
- every prompt has a flag, argument, or machine-readable action path
- old vague prompts/output are locked out by tests
- JSON/agent output remains valid, bounded, and stdout-clean
- focused tests pass, or unrelated failures are named with evidence
- changes to this skill are checked against at least 2 command families with different surfaces
