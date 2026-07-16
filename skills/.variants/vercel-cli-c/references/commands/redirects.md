<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel redirects

Manage redirects for a project. Redirects managed at the project level apply to all deployments and environments and take effect immediately after being created and promoted to production.

Aliases: `redirect`

```
vercel redirects <command>
```

## Subcommands

### `vercel redirects add`

Add a new redirect

```
vercel redirects add [source] [destination] [options]
```

#### Options

- `--case-sensitive` — Make the redirect case sensitive
- `--name <NAME>` — Version name for this redirect (max 256 characters)
- `--preserve-query-params` — Preserve query parameters when redirecting
- `--status <CODE>` — HTTP status code (301, 302, 307, or 308)
- `-y, --yes` — Skip prompts and use default values

#### Examples

Add a new redirect interactively

```
$ vercel redirects add
```

Add a new redirect with arguments

```
$ vercel redirects add /old-path /new-path
```

Add a redirect with all options

```
$ vercel redirects add /old-path /new-path --status 301 --case-sensitive --preserve-query-params --name "My redirect"
```

Add a redirect non-interactively

```
$ vercel redirects add /old-path /new-path --yes
```

### `vercel redirects list`

List all redirects for the current project. These redirects apply to all deployments and environments. There may also be redirects defined in a deployment that are not listed here.

Aliases: `ls`

```
vercel redirects list [options]
```

#### Options

- `--page <NUMBER>` — Page number to display
- `--per-page <NUMBER>` — Number of redirects per page (default: 50)
- `-s, --search <QUERY>` — Search for redirects by source or destination
- `--staging` — List redirects from the staging version
- `--version <VERSION_ID>` — List redirects from a specific version ID

#### Examples

List all redirects

```
$ vercel redirects list
```

Search for redirects

```
$ vercel redirects list --search "/old-path"
```

List redirects on page 2

```
$ vercel redirects list --page 2
```

List redirects with custom page size

```
$ vercel redirects list --per-page 25
```

### `vercel redirects list-versions`

List all versions of redirects

Aliases: `ls-versions`

```
vercel redirects list-versions
```

#### Examples

List all redirect versions

```
$ vercel redirects list-versions
```

### `vercel redirects promote`

Promote a staged redirects version to production

```
vercel redirects promote <version-id> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when promoting

#### Examples

Promote a redirect version

```
$ vercel redirects promote <version-id>
```

### `vercel redirects remove`

Remove a redirect

Aliases: `rm`

```
vercel redirects remove <source> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when removing a redirect

#### Examples

Remove a redirect

```
$ vercel redirects remove /old-path
```

### `vercel redirects restore`

Restore a previous redirects version

```
vercel redirects restore <version-id> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when restoring

#### Examples

Restore a redirects version

```
$ vercel redirects restore <version-id>
```

### `vercel redirects upload`

Upload redirects from a CSV or JSON file

Aliases: `import`

```
vercel redirects upload <file> [options]
```

#### Options

- `--overwrite` — Replace all existing redirects
- `-y, --yes` — Skip confirmation prompt

#### Examples

Upload redirects from CSV file

```
$ vercel redirects upload redirects.csv
```

Upload redirects from JSON file

```
$ vercel redirects upload redirects.json
```

Upload and overwrite existing redirects

```
$ vercel redirects upload redirects.csv --overwrite
```

Upload without confirmation

```
$ vercel redirects upload redirects.csv --yes
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
