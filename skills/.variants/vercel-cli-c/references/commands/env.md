<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel env

Interact with Environment Variables for a Project

```
vercel env <command>
```

## Subcommands

### `vercel env add`

Add an Environment Variable

```
vercel env add <name> [environment] [git-branch] [options]
```

#### Options

- `--force` — Overwrite an existing variable for the same target
- `--guidance` — Show command suggestions after completion
- `--no-sensitive` — Store the value as non-sensitive when policy allows
- `--sensitive` — Store the value as sensitive for Production or Preview
- `--value <VALUE>` — Set the variable value for non-interactive use; otherwise use stdin or the prompt
- `-y, --yes` — Skip the confirmation prompt when adding an Environment Variable

#### Examples

Add a new variable (prompts for value and Environments)

```
$ vercel env add <name>
$ vercel env add API_TOKEN
```

Add a new Environment Variable to a specific Environment

```
$ vercel env add <name> <production | preview | development>
$ vercel env add DB_PASS production
```

Add one variable to multiple Environments (comma-separated)

```
$ vercel env add <name> <environment>[,<environment>]
$ vercel env add API_URL production,preview,development
```

Override an existing Environment Variable of same target (production, preview, deployment)

```
$ vercel env add API_TOKEN --force
```

Add a regular (non-sensitive) Environment Variable that remains readable later

```
$ vercel env add API_TOKEN --no-sensitive
```

Add a new Environment Variable for a specific Environment and Git Branch

```
$ vercel env add <name> <production | preview | development> <gitbranch>
$ vercel env add DB_PASS preview feat1
```

Add a new Environment Variable from stdin

```
$ cat <file> | vercel env add <name> <production | preview | development>
$ cat ~/.npmrc | vercel env add NPM_RC preview
$ vercel env add API_URL production < url.txt
```

Add with --value for non-interactive use

```
$ vercel env add API_TOKEN production --value "<value>" --yes
```

### `vercel env list`

List all Environment Variables for a Project

Aliases: `ls`

```
vercel env list [environment] [git-branch] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--guidance` — Receive command suggestions once command is complete
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

### `vercel env pull`

Pull all Development Environment Variables from the cloud and write to a file [.env.local]

```
vercel env pull [filename] [options]
```

#### Options

- `--environment <TARGET>` — Set the Environment when pulling Environment Variables
- `--git-branch <NAME>` — Specify the Git branch to pull specific Environment Variables for
- `--id <ID>` — Pull environment variables for a specific deployment (e.g. dpl_xxx)
- `-y, --yes` — Skip the confirmation prompt when removing an environment variable

#### Examples

Pull all Development Environment Variables down from the cloud

```
$ vercel env pull <file>
$ vercel env pull .env.development.local
```

Pull environment variables for a specific deployment

```
$ vercel env pull --id dpl_xxx
```

### `vercel env remove`

Remove an Environment Variable (see examples below)

Aliases: `rm`

```
vercel env remove <name> [environment] [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when removing an Environment Variable

#### Examples

Remove a variable from multiple Environments

```
$ vercel env rm <name>
$ vercel env rm API_TOKEN
```

Remove a variable from a specific Environment

```
$ vercel env rm <name> <production | preview | development>
$ vercel env rm NPM_RC preview
```

Remove a variable from a specific Environment and Git Branch

```
$ vercel env rm <name> <production | preview | development> <gitbranch>
$ vercel env rm NPM_RC preview feat1
```

### `vercel env run`

Run a command with environment variables from the linked Vercel project

```
vercel env run <command ...> [options]
```

#### Options

- `-e, --environment <TARGET>` — Specify the environment to pull variables from (default: development)
- `--git-branch <NAME>` — Specify the Git branch to pull specific Environment Variables for

#### Examples

Run Next.js dev server with development environment variables

```
$ vercel env run -- next dev
```

Run tests with preview environment variables for a specific branch

```
$ vercel env run -e preview --git-branch feature-x -- npm test
```

### `vercel env update`

Update the value of an existing Environment Variable (see examples below)

```
vercel env update <name> [environment] [options]
```

#### Options

- `--sensitive` — Update to a sensitive Environment Variable
- `--value <VALUE>` — New value for the variable (non-interactive). Otherwise use stdin or you will be prompted.
- `-y, --yes` — Skip the confirmation prompt when updating an Environment Variable

#### Examples

Update a variable in all Environments

```
$ vercel env update <name>
$ vercel env update API_TOKEN
```

Update a variable in a specific Environment

```
$ vercel env update <name> <production | preview | development>
$ vercel env update DB_PASS production
```

Update a variable for a specific Environment and Git Branch

```
$ vercel env update <name> <production | preview | development> <gitbranch>
$ vercel env update NPM_RC preview feat1
```

Update a variable from stdin

```
$ cat <file> | vercel env update <name> <production | preview | development>
$ cat ~/.npmrc | vercel env update NPM_RC preview
$ vercel env update API_URL production < url.txt
```

## Examples

Run a command with Environment Variables from the linked Project

```
$ vercel env run -- <command>
```

Add one variable to multiple Environments

```
$ vercel env add API_URL production,preview,development
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
