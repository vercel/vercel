<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel remove

Remove deployment(s) by project name or deployment ID.

Aliases: `rm`

```
vercel remove <name|deploymentId ...> [options]
```

## Options

- `-s, --safe` — Skip deployments with an active alias
- `-y, --yes` — Skip confirmation

## Examples

Remove a deployment identified by Deployment ID

```
$ vercel remove dpl_abcdef123456890
```

Remove all deployments with Project name `my-app`

```
$ vercel remove my-app
```

Remove two deployments with Deployment IDs

```
$ vercel remove dpl_eyWt6zuSdeus dpl_uWHoA9RQ1d1o
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
