<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel upgrade

Upgrades the Vercel CLI to the latest version.

```
vercel upgrade [options]
```

## Options

- `--disable-auto` — Disable automatic CLI updates
- `--dry-run` — Show the upgrade command without executing it
- `--enable-auto` — Enable automatic CLI updates for future releases
- `-F, --format <FORMAT>` — Specify the output format (json) - implies --dry-run

## Examples

Upgrade the Vercel CLI to the latest version

```
$ vercel upgrade
```

Show the upgrade command without running it

```
$ vercel upgrade --dry-run
```

Enable automatic CLI updates

```
$ vercel upgrade --enable-auto
```

Get upgrade information as JSON

```
$ vercel upgrade --format=json
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
