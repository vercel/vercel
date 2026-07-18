# Vercel CLI Skill — Design

`skills/vercel-cli/` is an agent skill for the Vercel CLI. This directory
contains the tooling that keeps it honest. The core principle:

**The installed CLI's `--help` is the syntax authority. The skill carries
only what help output cannot express.**

Static per-command syntax duplicates a runtime-available, always
version-correct source, misleads agents whenever the installed CLI differs
from the repo snapshot, and restates things capable models already know.
This layering — runtime help for syntax, a skill for behavioral guidance —
is the pattern the official agent skills of other major developer CLIs have
converged on.

## What lives where

| Layer | Contents | Source of truth |
| --- | --- | --- |
| `vercel <command> --help` | Arguments, options, examples | The installed CLI |
| `skills/vercel-cli/generated/index.md` | Command map: families, aliases, one-line descriptions, global options | Generated from `packages/cli/src/commands/**/command.ts` |
| `skills/vercel-cli/SKILL.md` | Universal guidance, always in context: linking, output parsing, exit codes, agent-mode JSON errors, decision tree, anti-patterns | Handwritten |
| `skills/vercel-cli/references/*.md` | Family-specific traps, workflows, ordering constraints, negative guidance | Handwritten |

Rules for handwritten content:

- Never restate SKILL.md in a reference (SKILL.md is always loaded).
- Never enumerate flags/arguments/subcommands (help's job) or explain
  concepts a capable model already knows.
- Never document errors that teach their own recovery on first attempt;
  document failures that are destructive, silent, or misleading.
- Global-flag semantics live only in `references/global-options.md`.
- Inline syntax is allowed only for commands too new for model training
  data — the example validator keeps it honest.
- Every reference's line 3 is `> Exact syntax: \`vercel <family> --help\``
  (CI-enforced).

## Tooling

```text
scripts/vercel-cli-skill/
├── load-command-model.ts   parse + import CLI command metadata (read-only)
├── render-markdown.ts      render generated/index.md
├── validate-examples.ts    validate every `vercel …` example in skill docs
├── generate.ts             pnpm skills:vercel-cli:generate
├── check.ts                pnpm skills:vercel-cli:check (CI)
└── test/                   pnpm skills:vercel-cli:test (vitest)
```

Constraints:

- Never modifies `packages/cli/src/**`; imports `command.ts` metadata
  modules read-only. Never executes commands, authenticates, or touches the
  network.
- Deterministic output: no timestamps, no absolute paths, feature-flag env
  vars cleared before import. Byte-for-byte reproducible.
- The registry parser fails loud on anything it does not recognize
  (merged imports, renamed bindings, unparsed pushes) — a silently dropped
  command would otherwise survive CI, because check.ts regenerates with the
  same parser.
- Runs after `pnpm run build` in CI: command metadata imports built
  workspace deps (e.g. `@vercel-internals/constants`).

### check.ts fails when

- The committed `generated/index.md` is stale, or extra files exist under
  `generated/`.
- A visible root family is missing from the command map.
- A reference is missing its `> Exact syntax:` pointer line.
- Any handwritten `vercel`/`vc` example uses a command, subcommand, alias,
  or option that does not exist in the CLI metadata — including deprecated
  options and global options a command disables. Multiline commands, `vc`,
  env-var prefixes, quoting, `$(…)` substitution, and `--` forwarding are
  understood.
- A `skills/vercel-cli/validation-exceptions.json` entry is unused (each
  exception documents intentionally-negative guidance, e.g. a command that
  deliberately does not exist, and requires a reason).

### CI expectations

| Change in `packages/cli` | Result |
| --- | --- |
| New/removed root command family | Fails until `pnpm skills:vercel-cli:generate` reruns |
| New subcommand or option | No doc change required (`--help` covers it) |
| Rename/removal used by a handwritten example | Fails example validation |
| Root description changed | Fails command-map diff |
| Hidden command added | No public documentation required |

## Evals (planned, not implemented)

Structural checks prove the skill is accurate, not useful. Published
research shows generated context files can reduce agent task success while
raising cost, so before expanding content:

- **Trigger evals** — prompts that should and should not activate the skill.
- **Trajectory evals** — which files agents actually read; whether they run
  `--help` before uncommon flags; whether the first executed command is
  valid (reuse the example validator's resolver as the judge).
- **Outcome comparison** — same tasks with and without the skill; success
  rate and token cost decide any future content expansion.
- Feed results back: files agents never read get deleted; repeated mistakes
  become new reference gotchas.

Keep evals in `scripts/vercel-cli-skill/evals/` when implemented; they need
network, auth, and a sandbox, so they must never run in the lint job.
