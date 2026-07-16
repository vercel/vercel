<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel target

Manage your Vercel Project's "targets" (custom environments).

Aliases: `targets`

```
vercel target <command>
```

## Subcommands

### `vercel target list`

List targets defined for the current Project

Aliases: `ls`

```
vercel target list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip confirmation when linking is required (e.g. in non-interactive mode)

#### Examples

List all targets for the current Project

```
$ vercel target ls my-project
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
