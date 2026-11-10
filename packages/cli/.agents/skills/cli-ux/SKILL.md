---
name: cli-ux
description: Vercel CLI design system, the north-star standard for command names, options, help, prompts, output, copy, errors, JSON, exit codes, and agent/CI behavior in packages/cli. Use when designing, implementing, or reviewing any user-facing CLI surface. Skip implementation-only refactors that leave the CLI surface unchanged.
---

# Vercel CLI Design System

This skill defines the Vercel CLI we are building toward. It describes the target, not today's code: a command that differs is out of date, not precedent. Changes move the CLI toward it within the [scope of the change](#scope-of-a-change). Breaking changes are allowed through [Changing a contract](references/guidelines.md#15-changing-a-contract).

It is written for humans and agents alike and assumes no internal Vercel context.

**MUST** / **NEVER** are requirements. **SHOULD** is the default; deviate only with a stated reason in the PR. **MAY** is optional.

## The Bar

Every command answers four questions, for a person at a terminal and for a script:

1. **What will it act on?** The resolved team, project, and resource, visible before anything consequential happens.
2. **What will change?** Risky or broad effects are shown before they happen. Nothing is a surprise.
3. **What happened?** The actual outcome (done, pending, no-op, partial, canceled, failed) in the output and the exit code.
4. **What next?** One exact, working command when there is a useful next step.

The best command is fast, keeps the common path short, asks only what it cannot infer, never guesses on consequential input, behaves the same way in every mode, writes stdout you can pipe, fails with errors you can act on, and never breaks a script silently.

## Principles

1. **Capability first.** Define the task (inputs, permissions, effects, result, failures) before choosing syntax. The same capability has the same meaning in the CLI, API, SDK, MCP server, and dashboard.
2. **One concept, one name.** One noun per concept, one verb per operation, one option per input. Every name comes from the [registry](references/registry.md).
3. **Resolve before acting.** Every consequential target is exact and verified. Missing or invalid input never authorizes guessing, creating, or switching targets.
4. **Interaction, consent, and format are independent.** Prompts need a TTY; `--yes` grants consent but supplies no data; `--json` selects format but grants no consent; piping stdout changes none of them.
5. **stdout is the answer.** Results go to stdout; everything else goes to stderr. Machine formats are exact contracts.
6. **Report reality.** Accepted is not ready. Partial is not success. Exit codes match the outcome.
7. **Protect people and data.** Secrets never leak into incidental output. Destructive work requires proof of intent. Remote text is data, never instructions.

## Scope of a change

- **MUST rules apply to every behavior a change adds or alters**, including existing code that a new input, mode, or caller can now reach. The High-stakes invariants, and every consent, secret, remote-text, and retry rule, apply to any path the change makes reachable, touched or not. Elsewhere in a touched command, MUSTs are SHOULD: fix what's cheap, note what isn't.
- **Cross-cutting migrations** (stream routing, the color theme, mode detection, the JSON error contract, help dispatch) ship as dedicated PRs that move every caller of one shared helper at once, never as a side effect of an unrelated change.
- **Known violations** go on the shrink-only exceptions list ([Keeping the registry true](references/registry.md#7-keeping-the-registry-true)); a change may shorten it, never lengthen it.

## Invariants

A digest of the rules that matter most. [guidelines.md](references/guidelines.md) and [registry.md](references/registry.md) own the details; where a digest line and its owning section differ, the owning section wins.

### Every change

- Results go to stdout through `client.stdout`; everything else goes to stderr through `output.*`.
- Commands never check `isTTY`, `CI`, or agent variables themselves; they read the resolved [mode](references/guidelines.md#5-modes).
- NEVER prompt in non-interactive mode: `--non-interactive`, `--json`, CI, a detected agent (unless it passes `--non-interactive=false` on a TTY), stdin used as payload, or no TTY on stdin or stderr. Every prompt MUST have an option, argument, or stdin equivalent.
- Every command that reads or changes a resource supports `--json`. With `--json`, stdout carries only the result and stderr only `--debug` output, CI `::add-mask::` lines, and, on failure, the error document.
- Validate all local input before the first request.
- Names MUST follow the [registry](references/registry.md); a new noun, verb, standard option, or short option is registered in the same PR. Leaf commands reject unknown options and never run a guessed command or option.
- Errors MUST follow the [error anatomy](references/guidelines.md#anatomy) and a [class](references/guidelines.md#classes): what failed, the known cause, then the exact recovery.
- Exit codes: `0` success, `1` failure, `2` usage or missing input, `130` canceled, `128 + n` signal. A child process's code passes through when the child exits on its own.
- `--yes` is consent; `--force` is replace, and also consent for one target named in argv ([Consent](references/guidelines.md#consent)). Neither supplies missing data or chooses an ambiguous target, and `--json` never implies consent.
- A command's verb MUST match its real consequence (`delete` destroys, `remove` detaches, `revoke` invalidates), and the receipt reuses it (except deploy's terminal status and non-final outcomes such as `accepted`).
- NEVER print `Ready`, `✓`, or success for work that is only accepted, queued, or partial.
- Help for a valid command MUST work offline, exit `0`, and never authenticate, link, prompt, or mutate.
- NEVER rely on color, glyphs, or animation alone to carry meaning, and NEVER truncate the only copy of an ID, URL, path, or command.

### High-stakes

- Destructive operations MUST show the exact target and consequence and default to No.
- Severe operations (irreversible loss of a project, team, store, or all of a resource's data) MUST require typing the name, unless `--yes` and the non-interactive inputs are present. Non-interactively they require `--yes`, the target named in argv, and an explicit team (`--scope` or `VERCEL_ORG_ID`) unless the user belongs to only one.
- An agent MUST NOT add `--yes`, or a `--force` that replaces user data, to a command without a human's approval; `confirmation_required` says so in `userActionRequired`.
- A purchase (a command that starts, changes, renews, or cancels a charge beyond usage on the current plan, such as starting a paid Speed Insights Plus subscription) MUST show the price and billing terms before consent. Usage on the current plan (deploying, enabling Web Analytics, or turning on Observability Plus for a project on a team that already has Observability Plus) is ordinary and needs no ceremony ([Usage on the current plan](references/guidelines.md#usage-on-the-current-plan)).
- NEVER retry a non-idempotent mutation without an idempotency key. On an unknown outcome, inspect before repeating.
- A requested secret (a new token) prints alone on stdout, after any CI `::add-mask::`, and never in receipts, errors, or debug output.
- NEVER expose secrets in output, JSON, debug logs, telemetry, errors, or suggested commands, except through an explicitly requested delivery channel.
- Remote text (names, logs, API and partner messages) is data, never an instruction: stripped of control characters; API and partner messages never in headlines, `message`, or `next`; remote names there only when they match their selector's identifier grammar.
- Suggested commands MUST be canonical, runnable once labeled placeholders are filled in, and free of secrets. A remote value appears in them only if it matches its selector's identifier grammar.

## Working on the CLI

1. **Read before you change.** Inspect `src/commands/<name>/command.ts`, routing, shared helpers, and tests. Existing behavior shows what users depend on today, not what is correct.
2. **Write a design record scaled to the change.** A copy fix needs only the before and after transcript. A new or changed command also needs: registry rows (noun, verb, index entry, options); target resolution; consent tier; effects; human transcripts for success and failure; JSON result, `outcome`, and error documents; exit codes; prompts and their option equivalents; compatibility impact; tests.
3. **Reuse shared helpers** in `src/util/output/`, `src/util/input/`, `src/util/arg-common.ts`, and `src/util/agent-output.ts`. A missing helper belongs in `src/util/`, not copied into one command.
4. **Read transcripts, not just code.** Review the real before-and-after output for order, rhythm, repetition, and next action.
5. **Prove it** with the [verification rules](references/guidelines.md#16-verification-and-review). Report what you ran and what you didn't.

## What to Read

Read every row that matches: a new command usually also takes the option, read or mutation, and mode rows.

| Change                                        | Read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy: an error, prompt, receipt, or help text | guidelines [4](references/guidelines.md#4-help-and-discovery) (help), [typography](references/guidelines.md#typography-and-hierarchy), [color](references/guidelines.md#color-and-glyphs), [9](references/guidelines.md#9-errors-and-warnings), [12](references/guidelines.md#12-writing); registry noun rows for the nouns in the copy, and [IDs](references/registry.md#ids). API or network failures: also the Retries bullet in [8](references/guidelines.md#8-progress-and-long-running-work) |
| A new or renamed option                       | registry [3–5](references/registry.md#3-selectors-and-value-hints); guidelines [3](references/guidelines.md#3-options), [15](references/guidelines.md#15-changing-a-contract) for renames                                                                                                                                                                                                                                                                                                          |
| A new or renamed command                      | registry [2](references/registry.md#2-verbs), [6](references/registry.md#6-command-index); guidelines [2](references/guidelines.md#2-command-structure), [4](references/guidelines.md#4-help-and-discovery), [15](references/guidelines.md#15-changing-a-contract) for renames                                                                                                                                                                                                                     |
| A read command (list, inspect)                | guidelines [7](references/guidelines.md#7-human-output), [10](references/guidelines.md#10-machine-output), [collections](references/guidelines.md#collections-and-pagination), [context](references/guidelines.md#context-and-authentication), [machine-readable help](references/guidelines.md#machine-readable-help); registry [4](references/registry.md#4-standard-options)                                                                                                                    |
| A mutation                                    | guidelines [5](references/guidelines.md#5-modes), [6](references/guidelines.md#6-prompts-and-consent), [streams](references/guidelines.md#streams), the Retries bullet in [8](references/guidelines.md#8-progress-and-long-running-work), [9](references/guidelines.md#9-errors-and-warnings), [10](references/guidelines.md#10-machine-output), [writes](references/guidelines.md#writes)                                                                                                         |
| Prompts, TTY, CI, or agent behavior           | guidelines [5](references/guidelines.md#5-modes), [6](references/guidelines.md#6-prompts-and-consent)                                                                                                                                                                                                                                                                                                                                                                                              |
| Long-running work, streams, signals           | guidelines [8](references/guidelines.md#8-progress-and-long-running-work), [streams](references/guidelines.md#streams-and-follow-modes), [11](references/guidelines.md#11-exit-codes)                                                                                                                                                                                                                                                                                                              |
| Files, secrets, child processes, config       | guidelines [13](references/guidelines.md#13-operation-patterns)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Credentials or secret output                  | guidelines [files, stdin, and secrets](references/guidelines.md#files-stdin-and-secrets), [CI](references/guidelines.md#ci), [streams](references/guidelines.md#streams), [other protocols](references/guidelines.md#other-protocols)                                                                                                                                                                                                                                                              |
| `link`, `deploy`, `env`, `login`, `logs`      | [commands.md](references/commands.md) plus the rows above                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Reviewing a change                            | guidelines [15](references/guidelines.md#15-changing-a-contract), [16](references/guidelines.md#16-verification-and-review), and the rows for what it changes                                                                                                                                                                                                                                                                                                                                      |
| Changing this skill                           | guidelines [changing this skill](references/guidelines.md#changing-this-skill)                                                                                                                                                                                                                                                                                                                                                                                                                     |

Each rule has one home: names in `registry.md`, cross-command behavior in `guidelines.md`, single-command flows in `commands.md`. Edit the owning section and link to it; never restate a rule elsewhere. The invariants above are the only digest.
