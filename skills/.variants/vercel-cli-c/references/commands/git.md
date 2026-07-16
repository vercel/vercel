<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel git

Manage your Git repository connection to the current Project

```
vercel git <command>
```

## Subcommands

### `vercel git connect`

Connect your Vercel Project to your Git repository or provide the remote URL to your Git repository

```
vercel git connect [git-url] [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

#### Examples

Connect your Vercel Project to your Git repository defined in your local `.git` config

```
$ vercel git connect
```

Connect your Vercel Project to a Git repository using the remote URL

```
$ vercel git connect https://github.com/user/repo.git
```

### `vercel git disconnect`

Disconnect the Git repository from your Vercel Project

```
vercel git disconnect [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

#### Examples

Disconnect the Git repository

```
$ vercel git disconnect
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
