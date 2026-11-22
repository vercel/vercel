# Vercel CLI Agent Guide

Always-loaded guidance for work inside `packages/cli`. Keep this file small. The CLI UX design system lives in `packages/cli/.agents/skills/cli-ux/` and should be loaded only when the task or code review touches user-facing CLI behavior.

## First Steps

1. Inspect the current source and tests before changing behavior.
2. Identify whether the task or review changes implementation only, or CLI UX/copy/output/help/errors/prompts/non-interactive behavior.
3. For CLI UX implementation or review, use `packages/cli/.agents/skills/cli-ux/SKILL.md` and its references. The `cli-ux` skill folder is the canonical source for CLI design, copywriting, output layout, prompts, machine-readable output, agent behavior, and command-specific UX contracts.
4. Reuse local helpers and command-family patterns before adding new abstractions.
5. Preserve compatibility for command names, flags, exit codes, env vars, config files, JSON fields, parseable stdout, and telemetry semantics unless the change intentionally migrates them with tests.

## Task Routing

- UX/copy/prompt/output/help/error/JSON/agent behavior: use `packages/cli/.agents/skills/cli-ux/SKILL.md` and load the references it names.
- Vercel Agent Review and any other code review of those surfaces: load the `cli-ux` skill before assessing the diff or posting findings, even when the review makes no edits.
- New or changed command metadata: update `src/commands/<name>/command.ts`, telemetry, help snapshots, and tests.
- New or renamed command, option, noun, or verb: check `packages/cli/.agents/skills/cli-ux/references/registry.md` first and update it in the same change.
- Command implementation: follow the surrounding command family in `src/commands/<name>/` and shared helpers in `src/util/`.
- Shared output, prompt, target resolution, or remote-mutation behavior: inspect parallel command paths before editing one path.
- New durable CLI UX rule or command-specific UX contract: update the `cli-ux` skill, not this file.

## Code Map

```text
src/commands/<name>/
  command.ts      command metadata: description, args, options, examples
  index.ts        routing, parsing, telemetry, errors
  <action>.ts     subcommand/action implementation

src/util/telemetry/commands/<name>/
  index.ts        telemetry client

test/unit/commands/<name>/
  *.test.ts
```

Common shared areas:

- `src/util/arg-common.ts` for shared flags and command-string helpers
- `src/util/agent-output*` for non-interactive/agent payloads
- `src/util/output/*` and output-manager helpers for terminal output
- `src/util/input/*` for prompts and validated interactive input
- `src/util/{projects,teams,target,config}` for shared resource and target resolution
- `src/util/{deploy,link,env,domains,alias}` for high-impact remote mutation flows

## Implementation Rules

- Define commands in `command.ts` as const command objects.
- Use lowercase kebab-case for flags.
- Reuse shared options from `src/util/arg-common.ts` (`jsonOption`, `yesOption`, `limitOption`, `nextCursorOption`, `sinceOption`, `untilOption`, `projectOption`, and the rest). For a command-specific default, spread one and replace only `description`.
- Rename a command or option by keeping the old name as a hidden alias (or a `deprecated: true` option), warning with `warnDeprecatedSubcommand()` when it's used, tracking telemetry under the canonical name, updating the `cli-ux` registry, and adding a `minor` changeset.
- Parse flags with `parseArguments(args, getFlagsSpecification(command.options))`.
- Parent commands with subcommands may use permissive parsing to route; subcommands should parse strictly.
- Resolve subcommands with the `src/util/get-subcommand` default export and the named `getCommandAliases` helper.
- Exit `0` for completed success, `1` for operational failure, `2` for usage errors (unknown option, missing or invalid argument or flag value, unknown subcommand), and `130` for user cancellation (see the `cli-ux` Exit Codes section). Change an existing command's exit codes only as an intentional, tested contract change. A usage error reported with `outputAgentError()` or `outputActionRequired()` gets exit code `2` from its `reason` (`getExitCodeForReason()`); return the same code from the human path. A new usage-error `reason` or error code must be added to `USAGE_ERROR_REASONS` (`src/util/agent-output-constants.ts`) or `USAGE_ERROR_CODES` (`src/util/command-validation.ts`), or it exits `1`.
- Print warnings with `output.warning()` (the `!` gutter), not the legacy `output.warn()` and its `WARNING!` banner.
- The CLI entry point answers `--help` for every command (stdout, exit `0`) and shows a group's help when it runs without a subcommand (stdout, exit `0`), from the command metadata, so do not add per-command `--help` or bare-group handling; describe help content in `command.ts`, set `dynamicHelp` only when help depends on runtime data, and set `runsWithoutSubcommand` on a group that does work when run bare.
- Wrap top-level command logic in `try/catch`, print user-facing errors, and return `1`.
- Track telemetry after parsing and before command execution.
- Do not record tokens, secrets, env values, file contents, request bodies, or unredacted user content in telemetry.

## Testing

- Unit tests live under `packages/cli/test/unit/commands/<name>/`.
- Prefer focused tests for changed command behavior before broad test runs.
- Use existing mock client/scenario patterns for API behavior.
- When changing output, update direct expectations and add negative assertions for removed strings.
- When changing JSON, parse stdout and assert shape; do not snapshot incidental formatting only.
- When changing interactive behavior, test both TTY and non-interactive paths when both exist.
- When changing shared output, prompt, target-resolution, or remote-mutation helpers, inspect and test parallel command paths.
- `test/unit/commands/option-uniformity.test.ts` checks every command's options against the `cli-ux` registry. Its exception lists only shrink: fixing a command removes its entry.

Focused examples:

```bash
cd packages/cli
pnpm test test/unit/commands/<name>/<file>.test.ts
```

Repo-level checks when appropriate:

```bash
pnpm build
pnpm type-check
pnpm lint
pnpm test-unit
```

## Local CLI

Run the local CLI against an external project without installing globally:

```bash
cd packages/cli
pnpm vercel --cwd /path/to/project
```

## Guardrails

Always-loaded digest; full CLI UX gates live in `packages/cli/.agents/skills/cli-ux/references/guidelines.md` (Verification and Review).

- Do not prompt in non-interactive mode.
- Do not put human prose, warnings, ANSI, or spinners on JSON stdout.
- Do not expose secrets in output, JSON, debug logs, telemetry, or suggested commands.
- Validate local input before remote mutations.
- Do not retry non-idempotent remote mutations in a way that can duplicate resources.
- Do not edit examples, fixtures, generated files, or package-lock artifacts unless they are directly required for the task.
- Every PR needs a changeset. Use an empty changeset only for guide-only or `packages/cli/.agents`-only changes.
