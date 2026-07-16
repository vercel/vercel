<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel dev

Starts the `vercel dev` server.

Aliases: `develop`

```
vercel dev [dir] [options]
```

## Options

- `-l, --listen <URI>` — Specify a URI endpoint on which to listen [0.0.0.0:3000]
- `-L, --local` — Start the dev server without linking to a Vercel project
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Accept default value for all prompts

## Examples

Start the `vercel dev` server on port 8080

```
$ vercel dev --listen 8080
```

Make the `vercel dev` server bind to localhost on port 5000

```
$ vercel dev --listen 127.0.0.1:5000 
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
