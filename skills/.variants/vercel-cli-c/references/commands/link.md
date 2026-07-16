<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel link

Link a local directory to a Vercel project

```
vercel link <command> [options]
```

## Options

- `-p, --project <NAME_OR_ID>` — Set the project name or ID to link; required for non-interactive existing-project links
- `-r, --repo` — Link multiple projects from the Git repository (alpha)
- `--team <TEAM_ID_OR_SLUG>` — Set the team ID or slug; use with --project for non-interactive links
- `-y, --yes` — Skip questions when setting up with default team and settings

## Subcommands

### `vercel link add`

Add projects to an existing repository link created by link --repo

```
vercel link add [options]
```

#### Options

- `-y, --yes` — Skip questions when adding projects with default team and settings

#### Examples

Add projects to an existing repository link

```
$ vercel link add
```

## Examples

Link current directory to a Vercel project

```
$ vercel link
```

Link current directory with default options and skip questions

```
$ vercel link --yes
```

Link to an existing project in CI or agent mode

```
$ vercel link --yes --team <team-id> --project <project-name-or-id>
```

Link a specific directory to a Vercel project

```
$ vercel link --cwd /path/to/project
```

Link multiple projects from the current Git repository

```
$ vercel link --repo
```

Add additional projects to an existing repository link

```
$ vercel link add
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
