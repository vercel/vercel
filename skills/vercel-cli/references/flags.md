# Feature Flags

`vercel flags` manages [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) for the linked project.

`--help` is the source of truth for options and examples. Run `vercel flags --help` for the current subcommand list and `vercel flags <cmd> --help` before using a subcommand. The map below routes by task and carries no options on purpose.

## Subcommand Map

```bash
# Read
vercel flags list                 # flags in the project (alias: ls)
vercel flags inspect <flag>       # kind, variants, what each environment serves
vercel flags versions <flag>      # revision history (subcommands: list, diff)
vercel flags evaluations <flag>   # evaluation metrics

# Change what an environment serves
vercel flags set <flag>           # serve one variant (all kinds)
vercel flags enable <flag>        # boolean shortcut for true
vercel flags disable <flag>       # boolean shortcut for false
vercel flags use-targeting <flag> # enable targeting for an environment

# Targeting
vercel flags split <flag>         # weighted traffic split across variants
vercel flags rollout <flag>       # staged rollout from one variant to another
vercel flags rules <flag>         # targeting rules (subcommands: list, add, update, remove, move)
vercel flags segments             # reusable audience segments (subcommands: list, inspect, create, update, remove)

# Lifecycle
vercel flags create <flag>        # new flag (alias: add)
vercel flags update <flag>        # variant values and labels
vercel flags archive <flag>       # required before rm
vercel flags unarchive <flag>
vercel flags rm <flag>            # delete an archived flag (alias of remove)

# Tooling
vercel flags sdk-keys             # SDK keys (subcommands: list, add, remove)
vercel flags prepare              # flag definition fallbacks for builds outside Vercel
vercel flags override             # encrypt or decrypt a vercel-flag-overrides cookie token
vercel flags open [flag]          # open the dashboard
```

## CLI Contracts

- Flags commands need a linked project. Confirm the target with `vercel project inspect --non-interactive` first (see `SKILL.md`).
- Use `--json` where a subcommand offers it and parse only stdout.
- Commands that ask for confirmation (`archive`, `unarchive`, `rm`, `sdk-keys rm`, and others that list `--yes` in `--help`) need `--yes` in non-interactive runs.

## Flags SDK Skill

Everything flags-specific lives in the `flags-sdk` skill (`npx skills add vercel/flags@flags-sdk`): declaring flags with `flag()` and `vercelAdapter`, matching a CLI flag key to the `key` in code, `identify()` entities and the `--by` / `--condition` attribute contract, adopting a flag that already exists (`inspect` first), lifecycle and production safety, `FLAGS` / `FLAGS_SECRET`, `prepare`, and `override`. Use that skill for those topics; this reference does not repeat them.
